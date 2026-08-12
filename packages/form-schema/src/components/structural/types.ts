export interface ContainerProps {
  label?: string;
}

export interface SectionProps {
  title?: string;
  collapsible?: boolean;
}

export interface CardProps {
  title?: string;
  elevation?: number;
}

export interface ColumnsProps {
  count: number;
}

export interface TabsProps {
  tabs: string[]; // tab names
}

export interface AccordionProps {
  panels: string[];
  multiple?: boolean;
}
