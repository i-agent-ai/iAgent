import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { GridFSBucket, GridFSBucketWriteStream, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { environment } from '../../environments/environment';

export interface FileUploadResult {
  id: string;
  filename: string;
  size: number;
  mimetype: string;
  uploadDate: Date;
}

export interface FileInfo {
  id: string;
  filename: string;
  size: number;
  mimetype: string;
  uploadDate: Date;
  metadata?: any;
}

@Injectable()
export class FileService {
  private gridFSBucket: GridFSBucket;
  private readonly logger = new Logger(FileService.name);

  constructor(@InjectConnection() private connection: Connection) {
    if (!this.connection?.db) {
      throw new BadRequestException('Database connection not initialized');
    }
    this.gridFSBucket = new GridFSBucket(this.connection.db as any, {
      bucketName: 'fs'
    });
  }

  /**
   * Validate file against environment limits
   */
  private validateFile(file: any): void {
    const { maxFileSize, acceptedTypes } = environment.fileUpload;

    // Check file size
    if (file.size > maxFileSize) {
      throw new BadRequestException(
        `File size (${this.formatBytes(file.size)}) exceeds maximum allowed size (${this.formatBytes(maxFileSize)})`
      );
    }

    // Check file type if restrictions exist
    if (acceptedTypes.length > 0 && !acceptedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Accepted types: ${acceptedTypes.join(', ')}`
      );
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  async uploadFile(
    file: any,
    metadata?: any
  ): Promise<FileUploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file against environment limits
    this.validateFile(file);

    // Compute SHA-256 hash of file contents for deduplication
    const hash = createHash('sha256').update(file.buffer).digest('hex');

    // Enhanced deduplication: Check if a file with BOTH same content hash AND filename exists
    // This prevents deduplication when users intentionally rename files with same content
    const existing = await this.gridFSBucket
      .find({ 
        'metadata.hash': hash,
        'filename': file.originalname  // Must match filename too!
      })
      .limit(1)
      .toArray();

    if (existing.length > 0) {
      const dup = existing[0] as any;
      this.logger.log(`File already exists with same content and filename: ${file.originalname}`);
      return {
        id: dup._id.toString(),
        filename: dup.filename,
        size: dup.length,
        mimetype: dup.metadata?.mimetype || 'application/octet-stream',
        uploadDate: dup.uploadDate,
      };
    }

    const uploadStream: GridFSBucketWriteStream = this.gridFSBucket.openUploadStream(
      file.originalname,
      {
        metadata: {
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          hash,
          uploadedAt: new Date(),
          chatId: metadata?.chatId, // Support chat association
          userId: metadata?.userId, // Support user association
          ...metadata
        }
      }
    );

    this.logger.log(`Uploading new file: ${file.originalname} (${this.formatBytes(file.size)})`);


    return new Promise((resolve, reject) => {
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);

      readable.pipe(uploadStream);

      uploadStream.on('error', (error) => {
        reject(new BadRequestException(`Upload failed: ${error.message}`));
      });

      uploadStream.on('finish', () => {
        resolve({
          id: uploadStream.id.toString(),
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          uploadDate: new Date()
        });
      });
    });
  }

  async getFileStream(fileId: string): Promise<{ stream: Readable; fileInfo: FileInfo }> {
    try {
      const objectId = new ObjectId(fileId);
      const fileInfo = await this.getFileInfo(fileId);
      
      const downloadStream = this.gridFSBucket.openDownloadStream(objectId);
      
      return {
        stream: downloadStream,
        fileInfo
      };
    } catch (error) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  async getFileInfo(fileId: string): Promise<FileInfo> {
    try {
      const objectId = new ObjectId(fileId);
      const files = await this.gridFSBucket.find({ _id: objectId }).toArray();
      
      if (files.length === 0) {
        throw new NotFoundException(`File with ID ${fileId} not found`);
      }

      const file = files[0];
      return {
        id: file._id.toString(),
        filename: file.filename,
        size: file.length,
        mimetype: file.metadata?.mimetype || 'application/octet-stream',
        uploadDate: file.uploadDate,
        metadata: file.metadata
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  async listFiles(limit: number = 50, skip: number = 0): Promise<FileInfo[]> {
    const files = await this.gridFSBucket
      .find({})
      .sort({ uploadDate: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    return files.map(file => ({
      id: file._id.toString(),
      filename: file.filename,
      size: file.length,
      mimetype: file.metadata?.mimetype || 'application/octet-stream',
      uploadDate: file.uploadDate,
      metadata: file.metadata
    }));
  }

  /**
   * Advanced list with search/filter/sort and pagination (page or cursor)
   */
  async listFilesAdvanced(params: {
    q?: string;
    mimetype?: string;
    page?: number;
    limit?: number;
    sortBy?: 'size' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
    cursor?: string; // encode as ObjectId string cursor based on _id
  }): Promise<
    | { items: FileInfo[]; nextCursor?: string }
    | { items: FileInfo[]; page: number; total: number }
  > {
    const {
      q,
      mimetype,
      page,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      cursor,
    } = params;

    const db = this.connection.db!;
    const filesCol = db.collection('fs.files');

    const filter: any = {};
    if (q && q.trim().length > 0) {
      const regex = new RegExp(this.escapeRegex(q.trim()), 'i');
      filter.$or = [
        { filename: regex },
        { 'metadata.originalName': regex },
        { 'metadata.description': regex },
      ];
    }
    if (mimetype && mimetype.trim().length > 0) {
      filter['metadata.mimetype'] = mimetype.trim();
    }

    const sort: any = {};
    if (sortBy === 'size') sort.length = sortOrder === 'asc' ? 1 : -1;
    else if (sortBy === 'updatedAt') sort['metadata.updatedAt'] = sortOrder === 'asc' ? 1 : -1;
    else sort.uploadDate = sortOrder === 'asc' ? 1 : -1; // createdAt

    // Cursor mode
    if (cursor) {
      try {
        const cursorId = new ObjectId(cursor);
        // For stable pagination, also apply sort by _id when tie
        if (sort.uploadDate) {
          const lastDoc = await filesCol.findOne({ _id: cursorId });
          if (lastDoc) {
            const op = sort.uploadDate === 1 ? '$gt' : '$lt';
            filter.$or = [
              { uploadDate: { [op]: lastDoc.uploadDate } },
              { uploadDate: lastDoc.uploadDate, _id: { [op]: lastDoc._id } },
            ];
          }
        } else if (sort.length) {
          const lastDoc = await filesCol.findOne({ _id: cursorId });
          if (lastDoc) {
            const op = sort.length === 1 ? '$gt' : '$lt';
            filter.$or = [
              { length: { [op]: lastDoc.length } },
              { length: lastDoc.length, _id: { [op]: lastDoc._id } },
            ];
          }
        } else if (sort['metadata.updatedAt']) {
          const lastDoc = await filesCol.findOne({ _id: cursorId });
          if (lastDoc) {
            const op = sort['metadata.updatedAt'] === 1 ? '$gt' : '$lt';
            filter.$or = [
              { 'metadata.updatedAt': { [op]: lastDoc.metadata?.updatedAt || lastDoc.uploadDate } },
              { 'metadata.updatedAt': lastDoc.metadata?.updatedAt || lastDoc.uploadDate, _id: { [op]: lastDoc._id } },
            ];
          }
        }
      } catch {
        // ignore invalid cursor, treat as first page
      }

      const docs = await filesCol
        .find(filter)
        .sort({ ...sort, _id: sortOrder === 'asc' ? 1 : -1 })
        .limit(limit)
        .toArray();

      const items = docs.map((file: any) => ({
        id: file._id.toString(),
        filename: file.filename,
        size: file.length,
        mimetype: file.metadata?.mimetype || 'application/octet-stream',
        uploadDate: file.uploadDate,
        metadata: file.metadata,
      }));

      const next = docs.length === limit ? docs[docs.length - 1]?._id?.toString() : undefined;
      return { items, nextCursor: next };
    }

    // Page mode
    const pageNum = page && page > 0 ? page : 1;
    const skip = (pageNum - 1) * limit;

    const [docs, total] = await Promise.all([
      filesCol
        .find(filter)
        .sort({ ...sort, _id: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      filesCol.countDocuments(filter),
    ]);

    const items = docs.map((file: any) => ({
      id: file._id.toString(),
      filename: file.filename,
      size: file.length,
      mimetype: file.metadata?.mimetype || 'application/octet-stream',
      uploadDate: file.uploadDate,
      metadata: file.metadata,
    }));

    return { items, page: pageNum, total };
  }

  /**
   * Rename file (metadata-only update)
   */
  async renameFile(fileId: string, payload: { filename?: string; metadata?: any }): Promise<FileInfo> {
    const objectId = new ObjectId(fileId);
    const filesCol = this.connection.db!.collection('fs.files');

    const exists = await filesCol.findOne({ _id: objectId });
    if (!exists) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    const update: any = {};
    if (payload.filename) update.filename = payload.filename;
    if (payload.metadata) update.metadata = { ...(exists as any).metadata, ...payload.metadata, updatedAt: new Date() };
    else update.metadata = { ...(exists as any).metadata, updatedAt: new Date() };

    await filesCol.updateOne({ _id: objectId }, { $set: update });
    const updated = await filesCol.findOne({ _id: objectId });
    const file: any = updated;
    return {
      id: file._id.toString(),
      filename: file.filename,
      size: file.length,
      mimetype: file.metadata?.mimetype || 'application/octet-stream',
      uploadDate: file.uploadDate,
      metadata: file.metadata,
    };
  }

  /**
   * Replace file content (no versioning). Returns new FileInfo (id may change).
   */
  async replaceFile(
    fileId: string,
    newFile: any,
    additionalMetadata?: any
  ): Promise<FileUploadResult> {
    if (!newFile) {
      throw new BadRequestException('No file provided');
    }

    // Validate against limits
    this.validateFile(newFile);

    const objectId = new ObjectId(fileId);
    const filesCol = this.connection.db!.collection('fs.files');
    const existing = await filesCol.findOne({ _id: objectId });
    if (!existing) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Delete existing file (metadata doc and chunks)
    try {
      await this.gridFSBucket.delete(objectId);
    } catch (e) {
      // If delete fails because not found in bucket (race), continue
      this.logger.warn(`Failed to delete existing file ${fileId}: ${e instanceof Error ? e.message : e}`);
    }

    // Upload new file (id will be new)
    const result = await this.uploadFile(newFile, {
      ...existing?.metadata,
      ...additionalMetadata,
      originalReplacedId: fileId,
      updatedAt: new Date(),
    });

    return result;
  }

  /**
   * Simple helper to escape regex special chars
   */
  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const objectId = new ObjectId(fileId);
      await this.gridFSBucket.delete(objectId);
    } catch (error) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
  }

  async getFileCount(): Promise<number> {
    const files = await this.gridFSBucket.find({}).toArray();
    return files.length;
  }

  /**
   * Get files associated with a specific chat
   */
  async getFilesByChatId(chatId: string): Promise<FileInfo[]> {
    const files = await this.gridFSBucket
      .find({ 'metadata.chatId': chatId })
      .sort({ uploadDate: -1 })
      .toArray();

    return files.map(file => ({
      id: file._id.toString(),
      filename: file.filename,
      size: file.length,
      mimetype: file.metadata?.mimetype || 'application/octet-stream',
      uploadDate: file.uploadDate,
      metadata: file.metadata
    }));
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: any[],
    metadata?: any
  ): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = [];
    
    for (const file of files) {
      const result = await this.uploadFile(file, metadata);
      results.push(result);
    }
    
    return results;
  }
}
