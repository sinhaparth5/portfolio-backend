import { MediumService } from "./services/mediumService";
import { api, APIError, ErrCode } from "encore.dev/api";
import { ParsedMediumArticle } from "./types/Medium.d.ts";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("medium", { migrations: "./migrations" });

// Existing interfaces
interface AuthorRow {
    id: number;
}

interface CategoryRow {
    id: number;
}

interface ArticleRow {
    id: number;
}

interface GetMediumParams {
    username?: string;
    limit?: number;
}

interface GetMediumResponse {
    articles: ParsedMediumArticle[];
    total: number;
}

// New interfaces for stored articles
interface GetStoredArticlesParams {
    username?: string;
    limit?: number;
    offset?: number;
    category?: string;
}

interface StoredArticle {
    guid: string;
    title: string;
    link: string;
    published_at: Date;
    last_updated_at: Date;
    creator: string;
    categories: string[];
}

interface StoredArticleRow {
    guid: string;
    title: string;
    link: string;
    published_at: string;
    last_updated_at: string;
    creator: string;
    categories: string;
}

interface GetStoredArticlesResponse {
    articles: StoredArticle[];
    total: number;
    hasMore: boolean;
}

interface GetCategoriesResponse {
    categories: string[];
}

// Existing helper functions
async function getOrCreateAuthor(username: string): Promise<number> {
    const existingAuthor = db.query<AuthorRow>`
        SELECT id FROM medium_authors 
        WHERE username = ${username}
    `;

    for await (const row of existingAuthor) {
        return row.id;
    }

    const newAuthor = db.query<AuthorRow>`
        INSERT INTO medium_authors (username, sync_status)
        VALUES (${username}, 'success')
        RETURNING id
    `;

    for await (const row of newAuthor) {
        return row.id;
    }

    throw new Error("Failed to create or fetch author");
}

async function getOrCreateCategory(name: string): Promise<number> {
    const existingCategory = db.query<CategoryRow>`
        SELECT id FROM medium_categories 
        WHERE name = ${name}
    `;

    for await (const row of existingCategory) {
        return row.id;
    }

    const newCategory = db.query<CategoryRow>`
        INSERT INTO medium_categories (name)
        VALUES (${name})
        RETURNING id
    `;

    for await (const row of newCategory) {
        return row.id;
    }

    throw new Error("Failed to create or fetch category");
}

async function saveArticle(article: ParsedMediumArticle, authorId: number): Promise<number> {
    const existingArticle = db.query<ArticleRow>`
        SELECT id FROM medium_articles 
        WHERE guid = ${article.guid}
    `;

    for await (const row of existingArticle) {
        await db.exec`
            UPDATE medium_articles 
            SET 
                title = ${article.title},
                last_updated_at = ${article.lastUpdated}
            WHERE id = ${row.id}
        `;
        return row.id;
    }

    const newArticle = db.query<ArticleRow>`
        INSERT INTO medium_articles (
            guid,
            author_id,
            title,
            link,
            published_at,
            last_updated_at
        ) VALUES (
            ${article.guid},
            ${authorId},
            ${article.title},
            ${article.link},
            ${article.pubDate},
            ${article.lastUpdated}
        )
        RETURNING id
    `;

    for await (const row of newArticle) {
        return row.id;
    }

    throw new Error("Failed to save article");
}

// Your existing Medium API endpoint (unchanged)
export const mediumApi = api(
    { expose: true, auth: false, method: "GET", path: "/medium" },
    async (params: GetMediumParams): Promise<GetMediumResponse> => {
        const username = params.username || 'parth-sinha';
        const limit = params.limit || 10;

        try {
            const mediumService = new MediumService(username);
            const articles = await mediumService.getMediumArticles();

            // Get or create author
            const authorId = await getOrCreateAuthor(username);

            // Save each article and its categories
            for (const article of articles) {
                const articleId = await saveArticle(article, authorId);

                // Save categories
                for (const categoryName of article.categories) {
                    const categoryId = await getOrCreateCategory(categoryName);
                    
                    await db.exec`
                        INSERT INTO article_categories (article_id, category_id)
                        VALUES (${articleId}, ${categoryId})
                        ON CONFLICT (article_id, category_id) DO NOTHING
                    `;
                }
            }

            // Update author's last sync time
            await db.exec`
                UPDATE medium_authors 
                SET last_sync_at = CURRENT_TIMESTAMP
                WHERE id = ${authorId}
            `;

            // Return response
            return {
                articles: articles.slice(0, limit),
                total: articles.length
            };
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('Failed to fetch')) {
                    throw new APIError(ErrCode.OutOfRange, 'Unable to fetch Medium articles');
                }
                if (error.message.includes('parsing')) {
                    throw new APIError(ErrCode.InvalidArgument, 'Error parsing Medium feed data');
                }
                if (error.message.includes('database')) {
                    throw new APIError(ErrCode.Internal, 'Database error occurred');
                }
            }
            
            throw new APIError(ErrCode.Internal, 'An unexpected error occurred');
        }
    }
);

// New API endpoint to get stored articles
export const getStoredArticles = api(
    { 
        expose: true, 
        auth: false, 
        method: "GET", 
        path: "/medium/stored" 
    },
    async (): Promise<GetStoredArticlesResponse> => {
        try {
            const articles: StoredArticle[] = [];
            
            // Query for articles with categories as a string
            const query = db.query<StoredArticleRow>`
                SELECT 
                    ma.guid,
                    ma.title,
                    ma.link,
                    ma.published_at,
                    ma.last_updated_at,
                    auth.username as creator,
                    COALESCE(
                        STRING_AGG(DISTINCT mc.name, ','),
                        ''
                    ) as categories
                FROM medium_articles ma
                JOIN medium_authors auth ON ma.author_id = auth.id
                LEFT JOIN article_categories ac ON ma.id = ac.article_id
                LEFT JOIN medium_categories mc ON ac.category_id = mc.id
                GROUP BY 
                    ma.guid,
                    ma.title,
                    ma.link,
                    ma.published_at,
                    ma.last_updated_at,
                    auth.username
                ORDER BY ma.published_at DESC
            `;

            for await (const row of query) {
                try {
                    articles.push({
                        guid: row.guid,
                        title: row.title,
                        link: row.link,
                        published_at: new Date(row.published_at),
                        last_updated_at: new Date(row.last_updated_at),
                        creator: row.creator,
                        categories: row.categories ? row.categories.split(',').filter(Boolean) : []
                    });
                } catch (rowError) {
                    console.error('Error processing row:', rowError, row);
                    continue;
                }
            }

            return {
                articles,
                total: articles.length,
                hasMore: false
            };

        } catch (error) {
            console.error('Error fetching stored articles:', {
                error,
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            
            throw new APIError(ErrCode.Internal, 'Failed to fetch stored articles');
        }
    }
);
// New API endpoint to get categories
export const getCategories = api(
    {
        expose: true,
        auth: false,
        method: "GET",
        path: "/medium/categories"
    },
    async (): Promise<GetCategoriesResponse> => {
        try {
            const categories: string[] = [];
            const categoriesQuery = db.query<{ name: string }>`
                SELECT DISTINCT name 
                FROM medium_categories 
                ORDER BY name
            `;

            for await (const row of categoriesQuery) {
                categories.push(row.name);
            }

            return {
                categories
            };
        } catch (error) {
            console.error('Error fetching categories:', error);
            throw new APIError(ErrCode.Internal, 'Failed to fetch categories');
        }
    }
);