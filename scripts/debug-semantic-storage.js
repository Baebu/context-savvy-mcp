#!/usr/bin/env tsx
import Database from 'better-sqlite3';
import { SemanticDatabaseExtension } from '../src/infrastructure/adapters/semantic-database.extension.js';
console.log('🔍 Debugging Semantic Storage...');
try {
    const db = new Database('./data/context.db');
    console.log('\n📋 Context_Items Table Schema:');
    const schema = db.prepare("PRAGMA table_info(context_items)").all();
    schema.forEach((col) => {
        console.log(`  • ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULLABLE'} - ${col.dflt_value || 'NO DEFAULT'}`);
    });
    console.log('\n🧪 Testing Direct Insertion...');
    try {
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
        stmt.run('test:debug:direct', JSON.stringify({ test: 'direct insertion' }), 'test', JSON.stringify([0.1, 0.2, 0.3]), JSON.stringify(['test', 'debug']), 'test');
        console.log('✅ Direct insertion successful');
    }
    catch (error) {
        console.log('❌ Direct insertion failed:', error);
    }
    console.log('\n🧪 Testing Semantic Extension...');
    try {
        const semanticDb = new SemanticDatabaseExtension(db);
        await semanticDb.storeSemanticContext('test:debug:semantic', { test: 'semantic extension' }, 'test', [0.4, 0.5, 0.6], ['test', 'semantic']);
        console.log('✅ Semantic extension successful');
    }
    catch (error) {
        console.log('❌ Semantic extension failed:', error);
    }
    console.log('\n📊 Stored Data:');
    const stored = db.prepare("SELECT * FROM context_items WHERE key LIKE 'test:debug:%'").all();
    stored.forEach((row) => {
        console.log(`  • ${row.key}: ${Object.keys(row).join(', ')}`);
    });
    db.close();
    console.log('\n✅ Debug complete');
}
catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
}
