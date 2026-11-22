import serverless from 'serverless-http';
import expressAppHandler from '../../server.ts';

let wrappedHandler: any = null;

export const handler = async (event: any, context: any) => {
  if (!wrappedHandler) {
    wrappedHandler = serverless(expressAppHandler as any, {
      binary: ['image/*', 'application/octet-stream', 'application/pdf', 'application/zip'],
    });
  }
  return wrappedHandler(event, context);
};
