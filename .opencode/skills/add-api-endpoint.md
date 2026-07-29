# Add a New API Endpoint

Pattern for adding a new route + controller to the Express server.

## Steps

1. **Add the controller function** in `apps/server/src/controllers/chat.controller.ts` (or the appropriate controller file)
   - Use `asyncHandler` wrapper
   - Use `AuthRequest` type for authenticated requests
   - Return with `sendSuccess(res, data)` or `sendError(res, message, statusCode)`
   - Access the DB via `getDb()`
   - Use Drizzle ORM helpers (`eq`, `and`, `or`, `inArray`, `sql`, etc.)

2. **Add the route** in `apps/server/src/routes/chat.ts` (or appropriate route file)
   - Import the controller function
   - Add route with `authenticateToken` middleware
   - Add rate limiter if needed (from `rateLimiter.ts`: `standard`, `chatRequest`, `sendMessage`, etc.)

3. **Pattern: controller template**
   ```ts
   export const myHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
     const userId = String(req.user?.id || '');
     if (!userId) return sendError(res, 'Unauthorized', 401);

     const db = getDb();
     // ... query logic ...

     return sendSuccess(res, { key: value });
   });
   ```

4. **Verify**: build first, then check the route is reachable.
