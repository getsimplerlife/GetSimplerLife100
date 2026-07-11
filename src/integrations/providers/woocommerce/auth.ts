export class WooAuth {
  private consumerKey: string; private consumerSecret: string;
  constructor(consumerKey: string, consumerSecret: string) { this.consumerKey = consumerKey; this.consumerSecret = consumerSecret; }
  get headers() { return { Authorization: `Basic ${Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64")}`, "Content-Type": "application/json" }; }
}