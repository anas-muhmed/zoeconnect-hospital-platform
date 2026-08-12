export interface TableProps {
  columns: string[]; // column headers
  minRows?: number;
  maxRows?: number;
}

export interface RepeatSectionProps {
  minCount?: number;
  maxCount?: number;
}

export interface VariablesProps {
  variables: Record<string, string>; // name -> expression
}

export interface RulesProps {
  // A non-visual component that executes schema-level rules
  rules: Record<string, any>;
}
