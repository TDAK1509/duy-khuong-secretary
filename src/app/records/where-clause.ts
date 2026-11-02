export class WhereClause {
  private readonly conditions: string[] = [];
  private readonly boundValues: unknown[] = [];

  bind(value: unknown): string {
    this.boundValues.push(value);
    return `$${this.boundValues.length}`;
  }

  require(condition: string): void {
    this.conditions.push(condition);
  }

  get values(): unknown[] {
    return this.boundValues;
  }

  toSql(): string {
    return this.conditions.join(' AND ');
  }
}
