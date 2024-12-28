// services/mediumService.ts
import { MediumRSSResponse, ParsedMediumArticle } from '../types/Medium.d.ts';
import { XMLParser } from 'fast-xml-parser';

export class MediumService {
  private readonly parser: XMLParser;
  private readonly baseUrl: string;

  constructor(username: string) {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "_text",
      cdataPropName: "_cdata"
    });
    this.baseUrl = `https://medium.com/feed/@${username}`;
  }

  async getMediumArticles(): Promise<ParsedMediumArticle[]> {
    try {
      const response = await fetch(this.baseUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch Medium feed: ${response.statusText}`);
      }

      const xmlData = await response.text();
      const parsedData = this.parser.parse(xmlData);
      const feed = parsedData.rss.channel;

      return this.transformArticles(feed.item);
    } catch (error) {
      console.error('Error fetching Medium articles:', error);
      throw error;
    }
  }

  private transformArticles(items: any[]): ParsedMediumArticle[] {
    return items.map(item => ({
      title: this.cleanCDATA(item.title),
      link: item.link,
      guid: item.guid._text || item.guid,
      categories: item.category.map((cat: any) => this.cleanCDATA(cat)),
      creator: this.cleanCDATA(item['dc:creator']),
      pubDate: new Date(item.pubDate),
      lastUpdated: new Date(item['atom:updated']),
      content: this.cleanCDATA(item['content:encoded'])
    }));
  }

  private cleanCDATA(data: any): string {
    if (typeof data === 'object' && data._cdata) {
      return data._cdata;
    }
    return String(data);
  }
}