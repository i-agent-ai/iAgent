import { Test, TestingModule } from '@nestjs/testing';
import { FileController } from './file.controller';
import { FileService } from '../services/file.service';
import { BadRequestException } from '@nestjs/common';

describe('FileController', () => {
  let controller: FileController;
  let service: { listFilesAdvanced: jest.Mock; renameFile: jest.Mock; replaceFile: jest.Mock };

  beforeEach(async () => {
    service = {
      listFilesAdvanced: jest.fn(),
      renameFile: jest.fn(),
      replaceFile: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        { provide: FileService, useValue: service },
      ],
    }).compile();

    controller = module.get<FileController>(FileController);
  });

  it('should proxy list to service with advanced params', async () => {
    const expected = { items: [], page: 1, total: 0 };
    service.listFilesAdvanced.mockResolvedValue(expected);

    const result = await controller.listFiles('q', 'image/png', 'size', 'asc', '25', '1', undefined);
    expect(service.listFilesAdvanced).toHaveBeenCalledWith({
      q: 'q',
      mimetype: 'image/png',
      sortBy: 'size',
      sortOrder: 'asc',
      limit: 25,
      page: 1,
      cursor: undefined,
    });
    expect(result).toBe(expected);
  });

  it('should reject rename with empty body', async () => {
    await expect(controller.renameFile('id1', {} as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should call replaceFile when file provided', async () => {
    const fake = { id: '1', filename: 'a', size: 1, mimetype: 'x', uploadDate: new Date().toISOString() } as any;
    service.replaceFile.mockResolvedValue(fake);
    const result = await controller.replaceFile('id1', { any: 'thing' } as any);
    expect(service.replaceFile).toHaveBeenCalled();
    expect(result).toBe(fake);
  });
});


