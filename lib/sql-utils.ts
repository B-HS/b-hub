export const escapeLikePattern = (term: string): string => term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
