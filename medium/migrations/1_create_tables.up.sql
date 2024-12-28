-- Create enum for tracking sync status
CREATE TYPE sync_status AS ENUM ('pending', 'success', 'failed');

-- Create table for storing Medium authors/users
CREATE TABLE medium_authors (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status sync_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT username_length CHECK (char_length(username) >= 1)
);

-- Create table for storing categories
CREATE TABLE medium_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create main table for storing Medium articles
CREATE TABLE medium_articles (
    id SERIAL PRIMARY KEY,
    guid VARCHAR(255) NOT NULL UNIQUE,
    author_id INTEGER NOT NULL REFERENCES medium_authors(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    link VARCHAR(2048) NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT title_not_empty CHECK (char_length(title) >= 1),
    CONSTRAINT link_not_empty CHECK (char_length(link) >= 1)
);

-- Create junction table for article categories (many-to-many)
CREATE TABLE article_categories (
    article_id INTEGER REFERENCES medium_articles(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES medium_categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (article_id, category_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_articles_author_id ON medium_articles(author_id);
CREATE INDEX idx_articles_published_at ON medium_articles(published_at);
CREATE INDEX idx_articles_guid ON medium_articles(guid);
CREATE INDEX idx_authors_username ON medium_authors(username);
CREATE INDEX idx_categories_name ON medium_categories(name);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables that need updated_at functionality
CREATE TRIGGER update_medium_articles_updated_at
    BEFORE UPDATE ON medium_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medium_authors_updated_at
    BEFORE UPDATE ON medium_authors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();