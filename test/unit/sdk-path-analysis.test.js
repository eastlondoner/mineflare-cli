const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const { ContextBuilder } = require('../../src/program-system/runtime/context');
const { Vec3 } = require('../../src/program-system/sdk/types');

describe('SDK Path Analysis', () => {
  let mockBotServer;
  let contextBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBotServer = {
      isConnected: jest.fn(() => true),
      getState: jest.fn(async () => ({
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        food: 20
      })),
      analyzePath: jest.fn()
    };
  });

  describe('world.analyze.pathTo', () => {
    it('should return trivially reachable for nearby open block', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: true,
        triviallyReachable: true,
        distance: 5,
        pathLength: 7,
        requirements: {
          digging: { needed: false, blocks: [], estimatedTime: 0, recommendedTool: null },
          building: { needed: false, blocksRequired: 0, gaps: [] },
          swimming: false,
          parkour: false,
          verticalChange: 0
        },
        difficulty: 'trivial',
        suggestedApproach: 'walk'
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(5, 64, 0);
      const analysis = await ctx.world.analyze.pathTo(target);

      expect(analysis.triviallyReachable).toBe(true);
      expect(analysis.reachable).toBe(true);
      expect(analysis.difficulty).toBe('trivial');
      expect(analysis.suggestedApproach).toBe('walk');
      expect(analysis.requirements.digging.needed).toBe(false);
      expect(analysis.requirements.building.needed).toBe(false);
    });

    it('should return digging requirement when path needs mining', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: true,
        triviallyReachable: false,
        distance: 10,
        pathLength: 15,
        requirements: {
          digging: {
            needed: true,
            blocks: [
              { position: { x: 3, y: 64, z: 0 }, type: 'stone', hardness: 1.5 },
              { position: { x: 4, y: 64, z: 0 }, type: 'dirt', hardness: 0.5 }
            ],
            estimatedTime: 10000,
            recommendedTool: 'pickaxe'
          },
          building: { needed: false, blocksRequired: 0, gaps: [] },
          swimming: false,
          parkour: false,
          verticalChange: 0
        },
        difficulty: 'medium',
        suggestedApproach: 'dig'
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind', 'dig']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(10, 64, 0);
      const analysis = await ctx.world.analyze.pathTo(target);

      expect(analysis.triviallyReachable).toBe(false);
      expect(analysis.reachable).toBe(true);
      expect(analysis.requirements.digging.needed).toBe(true);
      expect(analysis.requirements.digging.blocks.length).toBe(2);
      expect(analysis.requirements.digging.blocks[0].type).toBe('stone');
      expect(analysis.requirements.digging.recommendedTool).toBe('pickaxe');
      expect(analysis.difficulty).toBe('medium');
      expect(analysis.suggestedApproach).toBe('dig');
    });

    it('should return building requirement when path needs bridging', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: true,
        triviallyReachable: false,
        distance: 20,
        pathLength: 25,
        requirements: {
          digging: { needed: false, blocks: [], estimatedTime: 0, recommendedTool: null },
          building: {
            needed: true,
            blocksRequired: 3,
            gaps: [{ position: { x: 10, y: 64, z: 0 }, width: 3 }]
          },
          swimming: false,
          parkour: false,
          verticalChange: 0
        },
        difficulty: 'hard',
        suggestedApproach: 'build'
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind', 'place']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(20, 64, 0);
      const analysis = await ctx.world.analyze.pathTo(target);

      expect(analysis.requirements.building.needed).toBe(true);
      expect(analysis.requirements.building.blocksRequired).toBe(3);
      expect(analysis.difficulty).toBe('hard');
      expect(analysis.suggestedApproach).toBe('build');
    });

    it('should return unreachable for completely blocked targets', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: false,
        triviallyReachable: false,
        distance: 50,
        pathLength: null,
        requirements: {
          digging: { needed: false, blocks: [], estimatedTime: 0, recommendedTool: null },
          building: { needed: false, blocksRequired: 0, gaps: [] },
          swimming: false,
          parkour: false,
          verticalChange: 30
        },
        difficulty: 'unreachable',
        suggestedApproach: null
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(50, 94, 0);
      const analysis = await ctx.world.analyze.pathTo(target);

      expect(analysis.reachable).toBe(false);
      expect(analysis.triviallyReachable).toBe(false);
      expect(analysis.difficulty).toBe('unreachable');
      expect(analysis.suggestedApproach).toBeNull();
    });

    it('should convert block positions to Vec3', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: true,
        triviallyReachable: false,
        distance: 10,
        pathLength: 15,
        requirements: {
          digging: {
            needed: true,
            blocks: [
              { position: { x: 5, y: 64, z: 3 }, type: 'stone', hardness: 1.5 }
            ],
            estimatedTime: 5000,
            recommendedTool: 'pickaxe'
          },
          building: { needed: false, blocksRequired: 0, gaps: [] },
          swimming: false,
          parkour: false,
          verticalChange: 0
        },
        difficulty: 'easy',
        suggestedApproach: 'dig'
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
      const ctx = contextBuilder.build();

      const target = { x: 10, y: 64, z: 0 }; // Plain object, not Vec3
      const analysis = await ctx.world.analyze.pathTo(target);

      // Block position should be converted to Vec3
      expect(analysis.requirements.digging.blocks[0].position).toBeInstanceOf(Vec3);
      expect(analysis.requirements.digging.blocks[0].position.x).toBe(5);
      expect(analysis.requirements.digging.blocks[0].position.y).toBe(64);
      expect(analysis.requirements.digging.blocks[0].position.z).toBe(3);
    });

    it('should throw error when bot is disconnected', async () => {
      mockBotServer.isConnected.mockReturnValue(false);

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(10, 64, 0);
      
      await expect(ctx.world.analyze.pathTo(target)).rejects.toThrow('Bot is not connected');
    });

    it('should pass timeout option to analyzePath', async () => {
      mockBotServer.analyzePath.mockResolvedValue({
        reachable: true,
        triviallyReachable: true,
        distance: 5,
        pathLength: 7,
        requirements: {
          digging: { needed: false, blocks: [], estimatedTime: 0, recommendedTool: null },
          building: { needed: false, blocksRequired: 0, gaps: [] },
          swimming: false,
          parkour: false,
          verticalChange: 0
        },
        difficulty: 'trivial',
        suggestedApproach: 'walk'
      });

      contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
      const ctx = contextBuilder.build();

      const target = new Vec3(5, 64, 0);
      await ctx.world.analyze.pathTo(target, { timeoutMs: 5000 });

      expect(mockBotServer.analyzePath).toHaveBeenCalledWith(
        expect.any(Vec3),
        5000
      );
    });

    it('should correctly identify difficulty levels', async () => {
      const testCases = [
        { difficulty: 'trivial', blocksHardness: [] },
        { difficulty: 'easy', blocksHardness: [0.5, 0.6] },
        { difficulty: 'medium', blocksHardness: [1.5, 2.0] },
        { difficulty: 'hard', blocksHardness: [3.0, 5.0] }
      ];

      for (const testCase of testCases) {
        const blocks = testCase.blocksHardness.map((hardness, i) => ({
          position: { x: i, y: 64, z: 0 },
          type: 'test_block',
          hardness
        }));

        mockBotServer.analyzePath.mockResolvedValue({
          reachable: true,
          triviallyReachable: testCase.difficulty === 'trivial',
          distance: 10,
          pathLength: 15,
          requirements: {
            digging: {
              needed: blocks.length > 0,
              blocks,
              estimatedTime: blocks.length * 5000,
              recommendedTool: blocks.length > 0 ? 'pickaxe' : null
            },
            building: { needed: false, blocksRequired: 0, gaps: [] },
            swimming: false,
            parkour: false,
            verticalChange: 0
          },
          difficulty: testCase.difficulty,
          suggestedApproach: testCase.difficulty === 'trivial' ? 'walk' : 'dig'
        });

        contextBuilder = new ContextBuilder(mockBotServer, new Set(['move', 'pathfind']), {});
        const ctx = contextBuilder.build();

        const analysis = await ctx.world.analyze.pathTo(new Vec3(10, 64, 0));
        expect(analysis.difficulty).toBe(testCase.difficulty);
      }
    });
  });
});


