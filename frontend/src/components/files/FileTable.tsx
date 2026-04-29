import { FileRecord } from "@/lib/types";
import { Card } from "../ui/Card";
import { ClassificationPill } from "./ClassificationPill";
import { StatusBadge } from "./StatusBadge";
import { Download, Eye } from "lucide-react";
import { Button } from "../ui/Button";
import { buttonVariants } from "../ui/button-variants";
import Link from "next/link";

interface Props {
  files: FileRecord[];
}

export function FileTable({ files }: Props) {
  return (
    <Card className="overflow-hidden border border-white/5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-white/5">
            <tr>
              <th className="px-6 py-4 font-medium">File Name</th>
              <th className="px-6 py-4 font-medium">Classification</th>
              <th className="px-6 py-4 font-medium">Owner</th>
              <th className="px-6 py-4 font-medium">Uploaded Date</th>
              <th className="px-6 py-4 font-medium">Size</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4 font-medium text-foreground">{file.name}</td>
                <td className="px-6 py-4">
                  <ClassificationPill level={file.classification} />
                </td>
                <td className="px-6 py-4 text-muted-foreground">{file.owner}</td>
                <td className="px-6 py-4 text-muted-foreground">{file.uploadedAt}</td>
                <td className="px-6 py-4 text-muted-foreground">{file.size}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={file.status} />
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/files/${file.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
