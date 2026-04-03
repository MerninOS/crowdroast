"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Info, Upload } from "lucide-react";
import { Button } from "@/components/mernin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/mernin/Card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CSV_COLUMNS = [
  ["title", "Yes", "Lot title", "Guji Hambella Natural - Lot 47"],
  ["origin_country", "Yes", "Country of origin", "Ethiopia"],
  ["region", "No", "Origin region", "Guji"],
  ["farm", "No", "Farm or station", "Hambella Estate"],
  ["variety", "No", "Coffee variety", "Heirloom"],
  ["process", "No", "Processing method", "Natural"],
  ["altitude_min", "No", "Whole number masl", "1900"],
  ["altitude_max", "No", "Whole number masl", "2200"],
  ["crop_year", "No", "Crop year text", "2025"],
  ["score", "No", "Numeric score", "87.5"],
  ["description", "No", "Free text description", "Jammy cup with bright florals"],
  ["total_quantity_kg", "Yes", "Total available kilograms", "1200"],
  ["min_commitment_kg", "Yes", "Minimum trigger kilograms", "300"],
  ["price_per_kg", "Either", "Seller net price in USD/kg", "8.50"],
  ["price_per_lb", "Either", "Seller net price in USD/lb", "3.86"],
  ["commitment_deadline", "Yes", "Local time in YYYY-MM-DDTHH:MM", "2026-04-15T17:00"],
  ["flavor_notes", "No", "Pipe-separated values", "Blueberry|Jasmine|Cacao"],
  ["certifications", "No", "Pipe-separated values", "Organic|Fair Trade"],
  ["currency", "No", "3-letter currency code", "USD"],
] as const;

const SAMPLE_CSV = [
  CSV_COLUMNS.map(([name]) => name).join(","),
  [
    "Guji Hambella Natural - Lot 47",
    "Ethiopia",
    "Guji",
    "Hambella Estate",
    "Heirloom",
    "Natural",
    "1900",
    "2200",
    "2025",
    "87.5",
    "Jammy cup with bright florals",
    "1200",
    "300",
    "8.50",
    "",
    "2026-04-15T17:00",
    "Blueberry|Jasmine|Cacao",
    "Organic|Fair Trade",
    "USD",
  ].join(","),
].join("\n");

type ParsedRow = Record<string, string>;
const REQUIRED_HEADERS = [
  "title",
  "origin_country",
  "total_quantity_kg",
  "min_commitment_kg",
  "commitment_deadline",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRow.push(currentValue.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function mapCsvRows(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      parsedRows: [] as ParsedRow[],
      headers: [] as string[],
      error: "CSV must include a header row and at least one data row.",
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const missingRequired = REQUIRED_HEADERS.filter(
    (requiredHeader) => !headers.includes(requiredHeader)
  );

  if (missingRequired.length > 0) {
    return {
      parsedRows: [] as ParsedRow[],
      headers,
      error: `Missing required columns: ${missingRequired.join(", ")}.`,
    };
  }

  const parsedRows = rows.slice(1).map((row) =>
    headers.reduce<ParsedRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {})
  );

  return { parsedRows, headers, error: null };
}

export function SellerLotCsvUploadModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationSummary, setValidationSummary] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [rowErrors, setRowErrors] = useState<Array<{ row: number; message: string }>>(
    []
  );

  const parsed = useMemo(() => {
    if (!csvText.trim()) {
      return { parsedRows: [] as ParsedRow[], headers: [] as string[], error: null };
    }
    return mapCsvRows(csvText);
  }, [csvText]);

  const previewRows = parsed.parsedRows.slice(0, 5);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setRowErrors([]);
    setValidationSummary(null);

    try {
      const text = await file.text();
      setCsvText(text);
      setParseError(null);
    } catch {
      setCsvText("");
      setParseError("Unable to read that file.");
    }
  };

  const handleUpload = async () => {
    if (parsed.error) {
      setParseError(parsed.error);
      setValidationSummary(parsed.error);
      return;
    }
    if (parsed.parsedRows.length === 0) {
      const message = "Choose a CSV with at least one lot row.";
      setParseError(message);
      setValidationSummary(message);
      return;
    }

    setParseError(null);
    setValidationSummary(null);
    setRowErrors([]);
    setIsUploading(true);

    try {
      const response = await fetch("/api/lots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.parsedRows }),
      });

      const payload = await response.json();
      if (!response.ok) {
        if (Array.isArray(payload?.errors)) {
          setRowErrors(payload.errors);
          const firstError = payload.errors[0];
          const summary = `CSV validation failed. Row ${firstError.row}: ${firstError.message}`;
          setValidationSummary(summary);
          toast.error(summary);
          return;
        }
        setValidationSummary(payload?.error || "Failed to import CSV.");
        throw new Error(payload?.error || "Failed to import CSV.");
      }

      toast.success(`Created ${payload.created} lot${payload.created === 1 ? "" : "s"}.`);
      setOpen(false);
      setCsvText("");
      setFileName("");
      setValidationSummary(null);
      setRowErrors([]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import CSV.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <Upload className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-3 sm:p-4">
        <DialogHeader>
          <DialogTitle>Upload Lots by CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV of offerings to create lots in bulk. Prices in the CSV are
            the seller net prices; buyer-facing pricing will still add the 10% platform fee.
            All CSV uploads are created as drafts until you explicitly set them active.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center transition-colors hover:border-foreground/30 hover:bg-muted/40 sm:px-4 sm:py-8">
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Select CSV file
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  UTF-8 CSV with one offering per row
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {fileName && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Selected file: <span className="font-medium text-foreground">{fileName}</span>
                </p>
              )}

              {parseError && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {parseError}
                </p>
              )}

              {validationSummary && !parseError && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {validationSummary}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">CSV columns</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use the exact header names below. `flavor_notes` and
                    `certifications` should use `|` between values. Use local
                    time in `YYYY-MM-DDTHH:MM` format for `commitment_deadline`.
                    Provide either `price_per_kg` or `price_per_lb`. Bulk-uploaded
                    lots are always imported as drafts.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Table className="table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%] px-2 py-2 text-[11px]">Column</TableHead>
                      <TableHead className="w-[10%] px-2 py-2 text-[11px]">Req.</TableHead>
                      <TableHead className="w-[28%] px-2 py-2 text-[11px]">Format</TableHead>
                      <TableHead className="w-[42%] px-2 py-2 text-[11px]">Example</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CSV_COLUMNS.map(([name, required, format, example]) => (
                      <TableRow key={name}>
                        <TableCell className="break-words px-2 py-2 font-mono text-[11px] leading-4">
                          {name}
                        </TableCell>
                        <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                          {required}
                        </TableCell>
                        <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                          {format}
                        </TableCell>
                        <TableCell className="break-words px-2 py-2 text-[11px] leading-4 text-muted-foreground">
                          {example}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <Accordion type="single" collapsible defaultValue="sample-csv">
                <AccordionItem value="sample-csv" className="border-b-0">
                  <AccordionTrigger className="py-0 text-sm font-medium text-foreground hover:no-underline">
                    Example rows
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
                      {SAMPLE_CSV}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Preview</p>
                <p className="text-xs text-muted-foreground">
                  {parsed.parsedRows.length} row{parsed.parsedRows.length === 1 ? "" : "s"} detected
                </p>
              </div>

              {previewRows.length > 0 ? (
                <div className="mt-3 rounded-lg border">
                  <Table className="table-fixed text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[34%] px-2 py-2 text-[11px]">Title</TableHead>
                        <TableHead className="w-[18%] px-2 py-2 text-[11px]">Origin</TableHead>
                        <TableHead className="w-[16%] px-2 py-2 text-[11px]">Qty</TableHead>
                        <TableHead className="w-[16%] px-2 py-2 text-[11px]">Min</TableHead>
                        <TableHead className="w-[16%] px-2 py-2 text-[11px]">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, index) => (
                        <TableRow key={`${row.title || "row"}-${index}`}>
                          <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                            {row.title || "-"}
                          </TableCell>
                          <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                            {row.origin_country || "-"}
                          </TableCell>
                          <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                            {row.total_quantity_kg || "-"}
                          </TableCell>
                          <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                            {row.min_commitment_kg || "-"}
                          </TableCell>
                          <TableCell className="break-words px-2 py-2 text-[11px] leading-4">
                            {row.price_per_kg || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Upload a CSV to preview the first few rows before import.
                </p>
              )}
            </CardContent>
          </Card>

          {rowErrors.length > 0 && (
            <Card className="border-red-200 shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <p className="text-sm font-medium text-foreground">Row issues</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fix the rows below in your CSV and upload the file again.
                </p>
                <div className="mt-3 space-y-2">
                  {rowErrors.map((error, index) => (
                    <p
                      key={`${error.row}-${index}`}
                      className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      Row {error.row}: {error.message}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleUpload} disabled={isUploading}>
            {isUploading ? "Importing..." : "Create Lots"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
