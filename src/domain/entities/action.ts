import { slugify } from "../shared/slugify.ts";

export class Action {
  readonly action: string;
  readonly slug: string;

  constructor(action: string) {
    this.action = action;
    this.slug = slugify(action);
  }
}
