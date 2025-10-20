import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  // Pagination,
  TextField,
  MenuItem,
  Stack,
  InputAdornment,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  FilePresent as FileIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { fileService, FileInfo, CursorListResponse, PageListResponse } from '../services/fileService';
import SearchIcon from '@mui/icons-material/Search';

interface FileListProps {
  onFileDeleted?: () => void;
}

export const FileList: React.FC<FileListProps> = ({ onFileDeleted }) => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  // const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<FileInfo | null>(null);
  const [newFilename, setNewFilename] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Search / filter / sort state
  const [q, setQ] = useState('');
  const [mimetype, setMimetype] = useState('');
  const [sortBy, setSortBy] = useState<'size' | 'createdAt' | 'updatedAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Infinite loading via cursor
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Debounced search query
  const debouncedQ = useMemo(() => q, [q]);

  const filesPerPage = 20;

  const resetAndLoad = async () => {
    setLoading(true);
    setError(null);
    setFiles([]);
    setNextCursor(undefined);
    try {
      const result = (await fileService.listFiles({
        q: debouncedQ || undefined,
        mimetype: mimetype || undefined,
        sortBy,
        sortOrder,
        limit: filesPerPage,
        page: 1,
      })) as PageListResponse | CursorListResponse;

      if ('items' in result && 'page' in (result as any)) {
        const r = result as PageListResponse;
        setFiles(r.items);
        setTotalCount(r.total);
        setNextCursor(undefined);
      } else {
        const r = result as CursorListResponse;
        setFiles(r.items);
        setTotalCount(r.items.length);
        setNextCursor(r.nextCursor);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = (await fileService.listFiles({
        q: debouncedQ || undefined,
        mimetype: mimetype || undefined,
        sortBy,
        sortOrder,
        limit: filesPerPage,
        cursor: nextCursor,
      })) as CursorListResponse;
      setFiles(prev => [...prev, ...result.items]);
      setTotalCount(prev => prev + result.items.length);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more files');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    resetAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, mimetype, sortBy, sortOrder]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loaderRef.current, nextCursor, isLoadingMore]);

  const handleDownload = async (file: FileInfo) => {
    try {
      await fileService.downloadFile(file.id, file.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleDeleteClick = (fileId: string) => {
    setFileToDelete(fileId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    setDeleting(true);
    try {
      await fileService.deleteFile(fileToDelete);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      await resetAndLoad();
      onFileDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleRenameClick = (file: FileInfo) => {
    setFileToRename(file);
    setNewFilename(file.filename);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (!fileToRename || !newFilename.trim()) return;
    if (newFilename === fileToRename.filename) {
      setRenameDialogOpen(false);
      return;
    }

    setRenaming(true);
    setError(null);
    try {
      await fileService.renameFile(fileToRename.id, { filename: newFilename.trim() });
      setRenameDialogOpen(false);
      setFileToRename(null);
      setNewFilename('');
      await resetAndLoad();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setRenaming(false);
    }
  };

  const handleRefresh = () => {
    resetAndLoad();
  };

  const getFileIcon = (mimetype: string) => {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.startsWith('video/')) return '🎥';
    if (mimetype.startsWith('audio/')) return '🎵';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('text')) return '📝';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return '📦';
    return '📁';
  };

  // const totalPages = Math.ceil(totalCount / filesPerPage);

  if (loading && files.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Files in MongoDB GridFS ({totalCount} loaded)</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={loading}>
          Refresh
        </Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <TextField
          size="small"
          placeholder="Search filename or metadata"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }}
          fullWidth
        />
        <TextField
          size="small"
          placeholder="MIME type (e.g., image/png)"
          value={mimetype}
          onChange={(e) => setMimetype(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="createdAt">Created</MenuItem>
          <MenuItem value="updatedAt">Updated</MenuItem>
          <MenuItem value="size">Size</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="desc">Desc</MenuItem>
          <MenuItem value="asc">Asc</MenuItem>
        </TextField>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {files.length === 0 ? (
        <Box textAlign="center" py={4}>
          <FileIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No files uploaded yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload your first file using the upload component above
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Upload Date</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">
                          {getFileIcon(file.mimetype)}
                        </Typography>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {file.filename}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {fileService.formatFileSize(file.size)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={file.mimetype}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {fileService.formatDate(file.uploadDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" gap={1} justifyContent="center">
                        <Tooltip title="Preview">
                          <IconButton
                            size="small"
                            onClick={() => fileService.previewFile(file.id)}
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Rename">
                          <IconButton
                            size="small"
                            onClick={() => handleRenameClick(file)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Replace">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.onchange = async () => {
                                const f = (input.files && input.files[0]) || null;
                                if (!f) return;
                                try {
                                  await fileService.replaceFile(file.id, f);
                                  handleRefresh();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Replace failed');
                                }
                              };
                              input.click();
                            }}
                          >
                            <UploadIcon />
                          </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="Download">
                          <IconButton
                            size="small"
                            onClick={() => handleDownload(file)}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="File Info">
                          <IconButton
                            size="small"
                            onClick={() => setSelectedFile(file)}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(file.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Infinite loader sentinel */}
          <Box ref={loaderRef} display="flex" justifyContent="center" mt={2}>
            {isLoadingMore && <CircularProgress size={20} />}
          </Box>
        </>
      )}

      {/* File Info Dialog */}
      <Dialog open={!!selectedFile} onClose={() => setSelectedFile(null)} maxWidth="sm" fullWidth>
        <DialogTitle>File Information</DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Box>
              <Typography variant="body1" gutterBottom>
                <strong>Filename:</strong> {selectedFile.filename}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>Size:</strong> {fileService.formatFileSize(selectedFile.size)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>Type:</strong> {selectedFile.mimetype}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>Upload Date:</strong> {fileService.formatDate(selectedFile.uploadDate)}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>File ID:</strong> {selectedFile.id}
              </Typography>
              {selectedFile.metadata && (
                <Box mt={2}>
                  <Typography variant="body1" gutterBottom>
                    <strong>Metadata:</strong>
                  </Typography>
                  <pre style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
                    {JSON.stringify(selectedFile.metadata, null, 2)}
                  </pre>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedFile(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete File</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this file? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => !renaming && setRenameDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename File</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Filename"
            type="text"
            fullWidth
            variant="outlined"
            value={newFilename}
            onChange={(e) => setNewFilename(e.target.value)}
            disabled={renaming}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !renaming) {
                handleRenameConfirm();
              }
            }}
            helperText="Enter the new filename for this file"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} disabled={renaming}>
            Cancel
          </Button>
          <Button
            onClick={handleRenameConfirm}
            color="primary"
            variant="contained"
            disabled={renaming || !newFilename.trim() || newFilename === fileToRename?.filename}
          >
            {renaming ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};
