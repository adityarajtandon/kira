export const activityData = (workspaceId, actorId, action, entityType, entityId, metadata = {}, extra = {}) => ({
  workspaceId, actorId, action, entityType, entityId, metadata, ...extra,
});

