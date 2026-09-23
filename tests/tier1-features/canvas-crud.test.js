import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDbModule, resetDatabase } from '../helpers/setup.js';

describe('Tier 1: Franchise Canvas Database & CRUD Operations', () => {
  let dbModule;

  beforeEach(async () => {
    await resetDatabase();
    dbModule = await getDbModule();
  });

  it('should create and retrieve a Franchise Canvas board', async () => {
    const saved = await dbModule.saveCanvas({
      name: 'Marvel Cinematic Universe',
      description: 'Sacred Timeline & Multiverse',
      nodes: [
        {
          id: 'node_iron_man',
          type: 'mediaNode',
          position: { x: 100, y: 100 },
          data: {
            title: 'Iron Man',
            year: 2008,
            type: 'movie',
            status: 'completed'
          }
        }
      ],
      edges: []
    });

    assert.ok(saved);
    assert.ok(saved.id.startsWith('canvas_'));
    assert.equal(saved.name, 'Marvel Cinematic Universe');
    assert.equal(saved.nodes.length, 1);
    assert.equal(saved.nodes[0].data.title, 'Iron Man');

    const retrieved = await dbModule.getCanvasById(saved.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, saved.id);
    assert.equal(retrieved.name, 'Marvel Cinematic Universe');
  });

  it('should update nodes, edges and timestamps of an existing canvas', async () => {
    const created = await dbModule.saveCanvas({
      name: 'Star Wars Canon'
    });

    const updated = await dbModule.saveCanvas({
      id: created.id,
      name: 'Star Wars Complete Saga',
      nodes: [
        {
          id: 'node_ep4',
          type: 'mediaNode',
          position: { x: 50, y: 50 },
          data: { title: 'A New Hope', year: 1977, type: 'movie' }
        },
        {
          id: 'node_ep5',
          type: 'mediaNode',
          position: { x: 300, y: 50 },
          data: { title: 'The Empire Strikes Back', year: 1980, type: 'movie' }
        }
      ],
      edges: [
        {
          id: 'edge_ep4_ep5',
          source: 'node_ep4',
          target: 'node_ep5',
          relationType: 'sequel',
          label: 'Sequel'
        }
      ]
    });

    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'Star Wars Complete Saga');
    assert.equal(updated.nodes.length, 2);
    assert.equal(updated.edges.length, 1);
    assert.equal(updated.edges[0].label, 'Sequel');
  });

  it('should list all canvases sorted by updatedAt descending', async () => {
    const board1 = await dbModule.saveCanvas({ name: 'Board A' });
    // Small delay to ensure distinct timestamp
    await new Promise((r) => setTimeout(r, 15));
    const board2 = await dbModule.saveCanvas({ name: 'Board B' });

    const list = await dbModule.getCanvases();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, board2.id);
    assert.equal(list[1].id, board1.id);
  });

  it('should delete a canvas board by id', async () => {
    const board = await dbModule.saveCanvas({ name: 'To Be Deleted' });
    const listBefore = await dbModule.getCanvases();
    assert.equal(listBefore.length, 1);

    await dbModule.deleteCanvas(board.id);
    const listAfter = await dbModule.getCanvases();
    assert.equal(listAfter.length, 0);
  });

  it('should include canvases in all backup export modes and restore via importData', async () => {
    await dbModule.saveCanvas({
      id: 'canvas_lotr',
      name: 'The Lord of the Rings Universe',
      nodes: [
        {
          id: 'node_lotr_1',
          position: { x: 0, y: 0 },
          data: { title: 'The Fellowship of the Ring', year: 2001, type: 'movie' }
        }
      ],
      edges: []
    });

    // Test compact backup export
    const backupCompact = await dbModule.exportAllData({ mode: 'compact' });
    assert.ok(Array.isArray(backupCompact.canvases));
    assert.equal(backupCompact.canvases.length, 1);
    assert.equal(backupCompact.canvases[0].id, 'canvas_lotr');

    // Test minimal backup export
    const backupMinimal = await dbModule.exportAllData({ mode: 'minimal' });
    assert.ok(Array.isArray(backupMinimal.canvases));
    assert.equal(backupMinimal.canvases.length, 1);

    // Test wipe & importData restore
    await dbModule.deleteCanvas('canvas_lotr');
    const emptyCheck = await dbModule.getCanvases();
    assert.equal(emptyCheck.length, 0);

    await dbModule.importData(backupCompact, false);
    const restored = await dbModule.getCanvases();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, 'The Lord of the Rings Universe');
  });
});
