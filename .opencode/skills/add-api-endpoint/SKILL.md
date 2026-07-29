---
name: add-api-endpoint
description: Pattern for adding a new controller + route to the Express server
---

## Steps

1. **Add controller** in `apps/server/src/controllers/`:
   - Use `asyncHandler` wrapper
   - Use `AuthRequest` for authenticated requests
   - Return with `sendSuccess(res, data)` or `sendError(res, message, statusCode)`
   - Access DB via `getDb()`

2. **Add route** in `apps/server/src/routes/`:
   - Import controller function
   - Add route with `authenticateToken` middleware
   - Add rate limiter from `rateLimiter.ts` if needed

## Template
```ts
export const myHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = String(req.user?.id || '');
  if (!userId) return sendError(res, 'Unauthorized', 401);
  const db = getDb();
  return sendSuccess(res, { key: value });
});
```
