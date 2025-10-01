declare module "wx-react-gantt" {
  import { ComponentType } from "react";

  export interface Task {
    id: number;
    text: string;
    start: Date;
    end: Date;
    duration: number;
    progress: number;
    type?: "task" | "summary" | "milestone";
    parent?: number;
    lazy?: boolean;
    [key: string]: unknown;
  }

  export interface Link {
    id: number;
    source: number;
    target: number;
    type: "e2s" | "e2e" | "s2s" | "s2e";
  }

  export interface Scale {
    unit: "minute" | "hour" | "day" | "week" | "month" | "year";
    step: number;
    format: string;
  }

  export interface GanttProps {
    tasks: Task[];
    links?: Link[];
    scales?: Scale[];
    columns?: Array<{
      name: string;
      label: string;
      width?: number;
      align?: "left" | "center" | "right";
      template?: (task: Task) => string | React.ReactNode;
    }>;
    cellHeight?: number;
    cellWidth?: number;
    start?: Date;
    end?: Date;
    readonly?: boolean;
    onTaskClick?: (task: Task) => void;
    onTaskDblClick?: (task: Task) => void;
    onLinkClick?: (link: Link) => void;
    onScroll?: (scrollState: { x: number; y: number }) => void;
    [key: string]: unknown;
  }

  export const Gantt: ComponentType<GanttProps>;
}

declare module "wx-react-gantt/dist/gantt.css" {
  const content: string;
  export default content;
}
