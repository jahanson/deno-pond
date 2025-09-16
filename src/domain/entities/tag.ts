import { slugify } from "../shared/slugify.ts";

export class Tag {
  readonly raw: string;
  readonly normalized: string;
  readonly slug: string;

  constructor(raw: string) {
    this.raw = raw;
    this.normalized = this.normalize(raw);
    this.slug = slugify(raw);
  }

  private normalize(tag: string): string {
    return tag.toLowerCase().trim().replace(/\s+/g, "-");
  }
}
