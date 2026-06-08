import type {
  CommitChunkResult,
  ImportContext,
  ImportPreviewResponse,
} from '../types/import.types';

export interface ImportHandler {
  readonly importType: string;

  storageDir(): string;

  parseAndStage(
    schemaName: string,
    jobId: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<{ totalRows: number; fileSha256: string }>;

  validate(schemaName: string, jobId: string, ctx: ImportContext): Promise<void>;

  buildPreview(
    schemaName: string,
    jobId: string,
    page: number,
    pageSize: number,
  ): Promise<ImportPreviewResponse>;

  commitChunk(
    schemaName: string,
    jobId: string,
    ctx: ImportContext,
    offset: number,
    limit: number,
  ): Promise<CommitChunkResult>;

  generateErrorExport(schemaName: string, jobId: string): Promise<Buffer>;
}

export const IMPORT_HANDLER = Symbol('IMPORT_HANDLER');
