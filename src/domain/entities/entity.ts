export class Entity {
  readonly text: string;
  readonly type: string;

  constructor(text: string, type: string) {
    this.text = text;
    this.type = type;
  }
}
