export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Nicht gefunden.') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const unauthorized = (msg = 'Bitte zuerst anmelden.') => new HttpError(401, msg);
