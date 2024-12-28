export interface MediumRSSResponse {
    items: MediumArticle[];
}

export interface MediumArticle {
    title: string;
    link:string;
    guid: {
        isPermaLink: boolean;
        _text: string;
    };
    categories: string[];
    creator: string;
    pubDate: string;
    atomUpdate: string;
}

export interface Category {
    _cdata: string;
}

export interface Creator {
    _cdata: string;
}

export interface ParsedMediumArticle {
    title: string;
    link: string;
    guid: string;
    categories: string[];
    creator: string;
    pubDate: Date;
    lastUpdated: Date;
}