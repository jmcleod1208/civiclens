// Shared types and utilities for CivicLens

export type ApiResponse<T> = {
  data: T
  error: null
} | {
  data: null
  error: string
}
