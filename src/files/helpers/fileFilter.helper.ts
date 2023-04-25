export const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  // eslint-disable-next-line @typescript-eslint/ban-types
  cb: Function,
) => {
  if (!file) return cb(new Error('No file provided'), false);
  if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
    return cb(null, true);
  }
  cb(null, false);
};
