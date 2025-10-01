import { Gantt, type Task, type Link, type Scale } from "wx-react-gantt";
import "wx-react-gantt/dist/gantt.css";

const MyGanttComponent = () => {
  const tasks: Task[] = [
    {
      id: 20,
      text: "New Task",
      start: new Date(2024, 5, 11),
      end: new Date(2024, 6, 12),
      duration: 1,
      progress: 2,
      type: "task",
      lazy: false,
    },
    {
      id: 47,
      text: "[1] Master project",
      start: new Date(2024, 5, 12),
      end: new Date(2024, 7, 12),
      duration: 8,
      progress: 0,
      parent: 0,
      type: "summary",
    },
    {
      id: 22,
      text: "Task",
      start: new Date(2024, 7, 11),
      end: new Date(2024, 8, 12),
      duration: 8,
      progress: 0,
      parent: 47,
      type: "task",
    },
    {
      id: 21,
      text: "New Task 2",
      start: new Date(2024, 7, 10),
      end: new Date(2024, 8, 12),
      duration: 3,
      progress: 0,
      type: "task",
      lazy: false,
    },
  ];

  const links: Link[] = [{ id: 1, source: 20, target: 21, type: "e2e" as const }];

  const scales: Scale[] = [
    { unit: "month" as const, step: 1, format: "MMMM yyy" },
    { unit: "day" as const, step: 1, format: "d" },
  ];

  return <Gantt tasks={tasks} links={links} scales={scales} />;
};

export default MyGanttComponent;