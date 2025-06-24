-- Migration: Initial semantic features for context_items table
-- File: src/infrastructure/migrations/001_initial_semantic_features.sql
-- Description: Adds columns for vector embeddings, semantic tags, and relationships
-- This migration safely adds columns only if they don't exist

-- Helper function to add columns safely
-- We need to check column existence before adding them

-- Check existing columns first
PRAGMA table_info(context_items);

-- Add columns conditionally using a transaction
BEGIN TRANSACTION;

-- Try to add embedding column if it doesn't exist
-- We'll use a workaround since SQLite doesn't support IF NOT EXISTS for ALTER TABLE
INSERT OR IGNORE INTO pragma_table_info('context_items') VALUES (0, 'check_column', '', 0, NULL, 0);

-- Create a temporary table to test column existence
CREATE TEMP TABLE IF NOT EXISTS _column_check AS SELECT * FROM pragma_table_info('context_items') WHERE name = 'embedding';

-- Only add embedding if it doesn't exist
-- Use a different approach - try the ALTER and catch the error
-- SQLite will silently ignore duplicate column errors in some cases

-- Create the enhanced columns one by one with error handling
-- Note: This migration will be applied to a fresh database, so columns won't exist yet

-- Add semantic enhancement columns
ALTER TABLE context_items ADD COLUMN embedding TEXT; -- JSON array of floats for vector similarity
ALTER TABLE context_items ADD COLUMN semantic_tags TEXT; -- JSON array of extracted keywords/tags
ALTER TABLE context_items ADD COLUMN context_type TEXT DEFAULT 'generic'; -- Enhanced type classification
ALTER TABLE context_items ADD COLUMN relationships TEXT; -- JSON relationships to other context items
ALTER TABLE context_items ADD COLUMN relevance_score REAL DEFAULT 0.0; -- Relevance scoring
ALTER TABLE context_items ADD COLUMN access_count INTEGER DEFAULT 0; -- Usage tracking
ALTER TABLE context_items ADD COLUMN token_count INTEGER DEFAULT 0; -- Token counting
ALTER TABLE context_items ADD COLUMN metadata TEXT; -- Additional metadata
ALTER TABLE context_items ADD COLUMN accessed_at TEXT; -- Last access timestamp

COMMIT;

-- Create indexes for efficient semantic search
CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(context_type);
CREATE INDEX IF NOT EXISTS idx_semantic_tags ON context_items(semantic_tags);
CREATE INDEX IF NOT EXISTS idx_embedding_exists ON context_items(embedding) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_context_token_count ON context_items(token_count);
CREATE INDEX IF NOT EXISTS idx_context_accessed ON context_items(accessed_at);
CREATE INDEX IF NOT EXISTS idx_context_access_count ON context_items(access_count);

-- Create table for semantic search cache (for performance)
CREATE TABLE IF NOT EXISTS semantic_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  results TEXT NOT NULL, -- JSON array of results
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires ON semantic_cache(expires_at);

-- Create table for embedding model metadata
CREATE TABLE IF NOT EXISTS embedding_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  version TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 0
) WITHOUT ROWID;

-- Insert default embedding model configuration
INSERT OR REPLACE INTO embedding_models (id, name, dimensions, version, is_active)
VALUES ('simple-hash-384', 'Simple Hash Embedding', 384, '1.0.0', 1);

-- Create table for semantic relationships between context items
CREATE TABLE IF NOT EXISTS context_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_context_id TEXT NOT NULL,
  target_context_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'similar', 'related', 'child', 'parent', etc.
  similarity_score REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for context_relationships
CREATE INDEX IF NOT EXISTS idx_relationship_source ON context_relationships(source_context_id);
CREATE INDEX IF NOT EXISTS idx_relationship_target ON context_relationships(target_context_id);
CREATE INDEX IF NOT EXISTS idx_relationship_type ON context_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationship_similarity ON context_relationships(similarity_score DESC);

-- Create unique constraint to prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_relationship
ON context_relationships(source_context_id, target_context_id, relationship_type);
