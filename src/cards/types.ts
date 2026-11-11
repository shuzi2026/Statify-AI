import type { ReactNode } from "react";
import type { Entry } from "../model";
export type DrawnCardProps = {
  title: string;
  source: HTMLElement | null;
  close: () => void;
  edit: () => void;
  remove?: () => void;
  begin: () => Promise<boolean | Entry>;
  instant: boolean;
  blocked: boolean;
  restrictions: string[];
  hasFollowup: boolean;
  message?: string;
  children: ReactNode;
  back: ReactNode;
};
