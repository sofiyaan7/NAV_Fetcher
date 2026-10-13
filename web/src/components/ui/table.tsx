import * as React from "react";
import { cn } from "@/lib/utils";

const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
);
const TableHeader = ({ className, ...p }: React.ComponentProps<"thead">) => (
  <thead className={cn("[&_tr]:border-b", className)} {...p} />
);
const TableBody = ({ className, ...p }: React.ComponentProps<"tbody">) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />
);
const TableRow = ({ className, ...p }: React.ComponentProps<"tr">) => (
  <tr className={cn("border-b transition-colors hover:bg-muted/50", className)} {...p} />
);
const TableHead = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("h-10 px-4 text-left align-middle text-xs font-medium text-muted-foreground", className)} {...p} />
);
const TableCell = ({ className, ...p }: React.ComponentProps<"td">) => (
  <td className={cn("px-4 py-2.5 align-middle", className)} {...p} />
);
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
