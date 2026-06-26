import {
    _decorator,
    AudioClip,
    AudioSource,
    Color,
    Component,
    EventTouch,
    Graphics,
    instantiate,
    isValid,
    Label,
    Node,
    Prefab,
    ProgressBar,
    SpriteFrame,
    sys,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
} from 'cc';
import { TileView } from './TileView';

const { ccclass, property } = _decorator;

type Axis = 'horizontal' | 'vertical';
type Direction = 'left' | 'right' | 'up' | 'down';

interface TilePlacement {
    typeId: number;
    row: number;
    col: number;
    layer: number;
}

interface DragState {
    id: number;
    anchor: TileView;
    startUi: Vec2;
    currentUi: Vec2;
    axis: Axis | null;
    direction: Direction | null;
    segment: TileView[];
    maxStep: number;
    offset: number;
}

interface TileOrigin {
    row: number;
    col: number;
}

interface HintMove {
    anchor: TileView;
    direction?: Direction;
    steps?: number;
    pair?: [TileView, TileView];
}

@ccclass('GameController')
export class GameController extends Component {

    @property({ type: Node, displayName: '棋盘根节点' })
    public boardRoot: Node | null = null;

    @property({ type: Prefab, displayName: '麻将预制体' })
    public tilePrefab: Prefab | null = null;

    @property({ type: [SpriteFrame], displayName: '18张牌面（按文档顺序）' })
    public tileFrames: SpriteFrame[] = [];

    @property({ type: Label, displayName: '分数文本' })
    public scoreLabel: Label | null = null;

    @property({ type: Label, displayName: '倒计时文本' })
    public timeLabel: Label | null = null;

    @property({ type: ProgressBar, displayName: '倒计时进度条' })
    public timeProgress: ProgressBar | null = null;

    @property({ type: Node, displayName: 'Combo根节点' })
    public comboRoot: Node | null = null;

    @property({ type: Label, displayName: 'Combo文本' })
    public comboLabel: Label | null = null;

    @property({ type: Node, displayName: '开局/提示手指（可选）' })
    public guideHand: Node | null = null;

    @property({ type: Graphics, displayName: '消除连线画笔（可选）' })
    public lineGraphics: Graphics | null = null;

    @property({ type: Prefab, displayName: '浮动分数预制体（可选）' })
    public floatingScorePrefab: Prefab | null = null;

    @property({ type: Node, displayName: '低时间红屏警告（可选）' })
    public lowTimeWarning: Node | null = null;

    @property({ type: Node, displayName: '胜利界面' })
    public victoryPanel: Node | null = null;

    @property({ type: Node, displayName: '失败界面' })
    public failPanel: Node | null = null;

    @property({ type: [Label], displayName: '结算分数文本（可选，可多个）' })
    public resultScoreLabels: Label[] = [];

    @property({ type: AudioSource, displayName: '音效播放器（可选）' })
    public audioSource: AudioSource | null = null;

    @property({ type: AudioClip, displayName: '消除音效（可选）' })
    public eliminateAudio: AudioClip | null = null;

    @property({ type: AudioClip, displayName: '胜利音效（可选）' })
    public victoryAudio: AudioClip | null = null;

    @property({ type: AudioClip, displayName: '失败音效（可选）' })
    public failAudio: AudioClip | null = null;

    @property({ displayName: '横向格距' })
    public cellSpacingX = 88;

    @property({ displayName: '纵向格距' })
    public cellSpacingY = 102;

    @property({ displayName: '游戏时间（秒）' })
    public totalSeconds = 300;

    @property({ displayName: '无操作提示时间（秒）' })
    public idleHintSeconds = 3;

    @property({ displayName: '开局自动提示延迟（秒）' })
    public openingGuideDelay = 0.8;

    private readonly rows = 13;
    private readonly cols = 13;
    private readonly layerCount = 2;
    private readonly grids: Array<Array<Array<TileView | null>>> = [];
    private readonly allTiles: TileView[] = [];
    private currentLayer = 1;
    private remainingSeconds = 0;
    private timerStarted = false;
    private totalScore = 0;
    private displayedScore = 0;
    private scoreAnimationFrom = 0;
    private scoreAnimationElapsed = 0;
    private readonly scoreAnimationDuration = 0.42;
    private readonly appStoreUrl = 'https://apps.apple.com/us/app/sola-mahjong-match-tiles-game/id6758609907';
    private combo = 0;
    private lastEliminateAt = -999;
    private elapsed = 0;
    private idleElapsed = 0;
    private drag: DragState | null = null;
    private dragSequence = 0;
    private inputLocked = false;
    private gameEnded = false;
    private hintTiles: TileView[] = [];
    private readonly cascadeRows = new Set<number>();
    private readonly cascadeCols = new Set<number>();
    private cascadeLayer = -1;
    private lineClearSerial = 0;

    protected start(): void {
        this.resolveLineGraphics();
        this.victoryPanel && (this.victoryPanel.active = false);
        this.stopVictoryEffects();
        this.failPanel && (this.failPanel.active = false);
        this.stopVictoryEffects();
        this.comboRoot && (this.comboRoot.active = false);
        this.guideHand && (this.guideHand.active = false);
        this.lowTimeWarning && (this.lowTimeWarning.active = false);
        this.buildLevel();
        this.remainingSeconds = this.totalSeconds;
        this.refreshHud();
        this.scheduleOnce(() => this.showHint(true), this.openingGuideDelay);
    }

    protected update(dt: number): void {
        if (this.gameEnded) {
            return;
        }
        this.elapsed += dt;
        this.updateScoreAnimation(dt);
        if (this.timerStarted) {
            this.remainingSeconds = Math.max(0, this.remainingSeconds - dt);
        }
        this.idleElapsed += dt;
        this.refreshTime();

        if (this.combo > 0 && this.elapsed - this.lastEliminateAt > 3) {
            this.combo = 0;
            this.comboRoot && (this.comboRoot.active = false);
        }
        if (this.idleElapsed >= this.idleHintSeconds && !this.inputLocked && !this.drag) {
            this.idleElapsed = 0;
            this.showHint(false);
        }
        if (this.timerStarted && this.remainingSeconds <= 0) {
            this.finishGame(false);
        }
    }

    public restartGame(): void {
        this.unscheduleAllCallbacks();
        this.clearBoard();
        this.gameEnded = false;
        this.inputLocked = false;
        this.totalScore = 0;
        this.displayedScore = 0;
        this.scoreAnimationFrom = 0;
        this.scoreAnimationElapsed = 0;
        this.combo = 0;
        this.elapsed = 0;
        this.idleElapsed = 0;
        this.remainingSeconds = this.totalSeconds;
        this.timerStarted = false;
        this.currentLayer = this.layerCount - 1;
        this.victoryPanel && (this.victoryPanel.active = false);
        this.failPanel && (this.failPanel.active = false);
        this.comboRoot && (this.comboRoot.active = false);
        this.lowTimeWarning && (this.lowTimeWarning.active = false);
        this.buildLevel();
        this.refreshHud();
        this.scheduleOnce(() => this.showHint(true), this.openingGuideDelay);
    }

    public onTileTouchStart(tile: TileView, event: EventTouch): void {
        if (!this.canInteract(tile)) {
            return;
        }
        if (!this.timerStarted) {
            this.timerStarted = true;
        }
        this.onUserActivity();
        const ui = event.getUILocation();
        this.drag = {
            id: ++this.dragSequence,
            anchor: tile,
            startUi: ui.clone(),
            currentUi: ui.clone(),
            axis: null,
            direction: null,
            segment: [],
            maxStep: 0,
            offset: 0,
        };
        tile.setSelected(true);
    }

    public onTileTouchMove(tile: TileView, event: EventTouch): void {
        if (!this.drag || this.drag.anchor !== tile || this.inputLocked) {
            return;
        }
        this.drag.currentUi = event.getUILocation().clone();
        const dx = this.drag.currentUi.x - this.drag.startUi.x;
        const dy = this.drag.currentUi.y - this.drag.startUi.y;
        if (!this.drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
            return;
        }
        const axis: Axis = this.drag.axis || (Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical');
        const direction: Direction = axis === 'horizontal'
            ? (dx < 0 ? 'left' : 'right')
            : (dy > 0 ? 'up' : 'down');

        if (this.drag.direction !== direction) {
            this.restoreDragVisual(this.drag, false);
            const movement = this.collectSegment(tile, direction);
            this.drag.axis = axis;
            this.drag.direction = direction;
            this.drag.segment = movement.segment;
            this.drag.maxStep = movement.maxStep;
        }

        const spacing = axis === 'horizontal' ? this.cellSpacingX : this.cellSpacingY;
        const raw = axis === 'horizontal' ? dx : dy;
        const signedLimit = this.drag.maxStep * spacing;
        let offset = Math.max(-signedLimit, Math.min(signedLimit, raw));
        if ((direction === 'left' || direction === 'down') && offset > 0) {
            offset = 0;
        }
        if ((direction === 'right' || direction === 'up') && offset < 0) {
            offset = 0;
        }
        this.drag.offset = offset;
        this.applyDragVisual(this.drag);
    }

    public onTileTouchEnd(tile: TileView, event: EventTouch): void {
        if (!this.drag || this.drag.anchor !== tile) {
            return;
        }
        const drag = this.drag;
        this.drag = null;
        tile.setSelected(false);

        if (!drag.axis || !drag.direction || Math.abs(drag.offset) < 16) {
            this.restoreDragVisual(drag);
            this.tryTapEliminate(tile);
            return;
        }

        const spacing = drag.axis === 'horizontal' ? this.cellSpacingX : this.cellSpacingY;
        const steps = Math.min(drag.maxStep, Math.max(0, Math.round(Math.abs(drag.offset) / spacing)));
        if (steps <= 0) {
            this.restoreDragVisual(drag);
            return;
        }
        this.commitDrag(drag, steps);
    }

    public onTileTouchCancel(tile: TileView, event: EventTouch): void {
        if (!this.drag || this.drag.anchor !== tile) {
            return;
        }
        if (this.drag.axis && this.drag.direction && Math.abs(this.drag.offset) >= 16) {
            this.onTileTouchEnd(tile, event);
            return;
        }
        const drag = this.drag;
        this.drag = null;
        tile.setSelected(false);
        this.restoreDragVisual(drag);
    }

    private buildLevel(): void {
        if (!this.boardRoot || !this.tilePrefab || this.tileFrames.length < 18) {
            return;
        }
        this.clearBoard();
        for (let layer = 0; layer < this.layerCount; layer++) {
            this.grids[layer] = [];
            for (let row = 0; row < this.rows; row++) {
                this.grids[layer][row] = new Array<TileView | null>(this.cols).fill(null);
            }
        }
        const placements = this.createReferencePlacements();
        for (const placement of placements) {
            const node = instantiate(this.tilePrefab);
            const tile = node.getComponent(TileView);
            if (!tile) {
                node.destroy();
                continue;
            }
            this.boardRoot.addChild(node);
            tile.setup(
                this,
                placement.typeId,
                this.tileFrames[placement.typeId],
                placement.row,
                placement.col,
                placement.layer,
            );
            node.setPosition(this.cellPosition(placement.row, placement.col, placement.layer));
            this.grids[placement.layer][placement.row][placement.col] = tile;
            this.allTiles.push(tile);
        }
        this.allTiles
            .slice()
            .sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col)
            .forEach((tile, index) => tile.node.setSiblingIndex(index));
        this.currentLayer = this.findTopOccupiedLayer();
        this.refreshLayerVisibility();
    }

    private createReferencePlacements(): TilePlacement[] {
        const raw: Array<[number, Array<[number, number, number]>]> = [
            [0, [[3, 4, 0], [7, 3, 0], [4, 6, 1], [9, 6, 1]]],
            [1, [[3, 8, 0], [9, 6, 0]]],
            [2, [[4, 3, 0], [6, 3, 0], [5, 7, 1], [8, 6, 1]]],
            [3, [[4, 5, 0], [5, 8, 0], [5, 3, 1], [7, 6, 1]]],
            [4, [[4, 6, 0], [8, 5, 0], [4, 8, 1], [5, 9, 1]]],
            [5, [[4, 7, 0], [5, 5, 0], [6, 9, 1], [7, 8, 1]]],
            [6, [[4, 9, 0], [7, 9, 0], [5, 4, 1], [6, 3, 1]]],
            [7, [[5, 2, 0], [5, 3, 0]]],
            [8, [[5, 4, 0], [9, 5, 0]]],
            [9, [[5, 7, 0], [6, 2, 0], [6, 4, 1], [7, 5, 1]]],
            [10, [[5, 9, 0], [8, 6, 0], [5, 6, 1], [6, 6, 1]]],
            [11, [[5, 10, 0], [9, 7, 0]]],
            [12, [[6, 4, 0], [8, 4, 0]]],
            [13, [[6, 5, 0], [6, 7, 0], [5, 8, 1], [8, 7, 1]]],
            [14, [[6, 8, 0], [8, 7, 0], [7, 4, 1], [8, 5, 1]]],
            [15, [[6, 9, 0], [6, 10, 0], [4, 4, 1], [5, 5, 1]]],
            [16, [[8, 8, 0], [10, 6, 0]]],
            [17, [[6, 8, 1], [7, 7, 1]]],
        ];
        const result: TilePlacement[] = [];
        for (const [typeId, positions] of raw) {
            for (const [row, col, layer] of positions) {
                result.push({ typeId, row, col, layer });
            }
        }
        return result;
    }

    private collectSegment(anchor: TileView, direction: Direction): { segment: TileView[]; maxStep: number } {
        const grid = this.grids[this.currentLayer];
        const segment: TileView[] = [];
        let maxStep = 0;
        if (direction === 'left' || direction === 'right') {
            let start = anchor.col;
            let end = anchor.col;
            if (direction === 'left') {
                while (start > 0 && grid[anchor.row][start - 1]) start--;
                for (let col = start; col <= end; col++) grid[anchor.row][col] && segment.push(grid[anchor.row][col]!);
                for (let col = start - 1; col >= 0 && !grid[anchor.row][col]; col--) maxStep++;
            } else {
                while (end < this.cols - 1 && grid[anchor.row][end + 1]) end++;
                for (let col = start; col <= end; col++) grid[anchor.row][col] && segment.push(grid[anchor.row][col]!);
                for (let col = end + 1; col < this.cols && !grid[anchor.row][col]; col++) maxStep++;
            }
        } else {
            let start = anchor.row;
            let end = anchor.row;
            if (direction === 'up') {
                while (start > 0 && grid[start - 1][anchor.col]) start--;
                for (let row = start; row <= end; row++) grid[row][anchor.col] && segment.push(grid[row][anchor.col]!);
                for (let row = start - 1; row >= 0 && !grid[row][anchor.col]; row--) maxStep++;
            } else {
                while (end < this.rows - 1 && grid[end + 1][anchor.col]) end++;
                for (let row = start; row <= end; row++) grid[row][anchor.col] && segment.push(grid[row][anchor.col]!);
                for (let row = end + 1; row < this.rows && !grid[row][anchor.col]; row++) maxStep++;
            }
        }
        return { segment, maxStep };
    }

    private applyDragVisual(drag: DragState): void {
        for (const tile of drag.segment) {
            const base = this.cellPosition(tile.row, tile.col, tile.layer);
            tile.node.setPosition(
                base.x + (drag.axis === 'horizontal' ? drag.offset : 0),
                base.y + (drag.axis === 'vertical' ? drag.offset : 0),
                base.z,
            );
        }
    }

    private restoreDragVisual(drag: DragState, animated = true): void {
        for (const tile of drag.segment) {
            if (!tile.eliminated) {
                Tween.stopAllByTarget(tile.node);
                const target = this.cellPosition(tile.row, tile.col, tile.layer);
                if (animated) {
                    tween(tile.node).to(0.12, { position: target }).start();
                } else {
                    tile.node.setPosition(target);
                }
            }
        }
    }

    private commitDrag(drag: DragState, steps: number): void {
        if (!drag.direction) return;
        const dr = drag.direction === 'up' ? -steps : drag.direction === 'down' ? steps : 0;
        const dc = drag.direction === 'left' ? -steps : drag.direction === 'right' ? steps : 0;
        const grid = this.grids[this.currentLayer];
        const origins = new Map<TileView, TileOrigin>(
            drag.segment.map(tile => [tile, { row: tile.row, col: tile.col }]),
        );
        for (const tile of drag.segment) grid[tile.row][tile.col] = null;
        for (const tile of drag.segment) {
            tile.row += dr;
            tile.col += dc;
            grid[tile.row][tile.col] = tile;
            Tween.stopAllByTarget(tile.node);
            tween(tile.node)
                .to(0.12, { position: this.cellPosition(tile.row, tile.col, tile.layer) })
                .start();
        }
        this.inputLocked = true;
        this.scheduleOnce(() => {
            for (const tile of drag.segment) {
                if (!isValid(tile, true) || !isValid(tile.node, true) || tile.eliminated) continue;
                tile.node.setPosition(this.cellPosition(tile.row, tile.col, tile.layer));
            }
            const dragPairs = this.collectDragPairs(drag.segment);
            if (dragPairs.length > 0) {
                this.eliminateFromMovedTiles(drag.segment, origins, dragPairs);
                return;
            }
            this.restoreMovedTiles(drag.segment, origins);
            this.scheduleOnce(() => {
                this.inputLocked = false;
                this.ensurePlayable();
            }, 0.13);
        }, 0.14);
    }

    private restoreMovedTiles(
        tiles: TileView[],
        origins: Map<TileView, TileOrigin>,
    ): void {
        const validTiles = tiles.filter(tile =>
            isValid(tile, true)
            && isValid(tile.node, true)
            && !tile.eliminated
            && origins.has(tile));
        if (!validTiles.length) return;

        for (const tile of validTiles) {
            if (this.grids[tile.layer]?.[tile.row]?.[tile.col] === tile) {
                this.grids[tile.layer][tile.row][tile.col] = null;
            }
        }
        for (const tile of validTiles) {
            const origin = origins.get(tile)!;
            tile.row = origin.row;
            tile.col = origin.col;
            this.grids[tile.layer][tile.row][tile.col] = tile;
            Tween.stopAllByTarget(tile.node);
            tween(tile.node)
                .to(0.12, { position: this.cellPosition(tile.row, tile.col, tile.layer) })
                .start();
        }
    }

    private tryTapEliminate(tile: TileView): void {
        if (!this.canInteract(tile)) return;
        const pair = this.findPairForTile(this.grids[this.currentLayer], tile);
        if (pair) {
            this.eliminatePairs([[tile, pair]]);
        }
    }

    private collectOneRoundPairsFromMoved(movedTiles: TileView[]): Array<[TileView, TileView]> {
        const currentGrid = this.grids[this.currentLayer];
        const pairs: Array<[TileView, TileView]> = [];
        const used = new Set<TileView>();
        for (const moved of movedTiles) {
            if (!this.isTileOnOwnLayerGrid(moved)
                || moved.layer !== this.currentLayer
                || currentGrid[moved.row]?.[moved.col] !== moved
                || used.has(moved)) continue;
            const match = this.findPairForTile(currentGrid, moved);
            if (!match
                || used.has(match)
                || match.layer !== this.currentLayer
                || currentGrid[match.row]?.[match.col] !== match) {
                continue;
            }
            used.add(moved);
            used.add(match);
            pairs.push([moved, match]);
        }
        return pairs;
    }

    private collectDragPairs(movedTiles: TileView[]): Array<[TileView, TileView]> {
        return this.collectOneRoundPairsFromMoved(movedTiles);
    }

    private eliminateFromMovedTiles(
        movedTiles: TileView[],
        origins: Map<TileView, TileOrigin>,
        pairs: Array<[TileView, TileView]> = this.collectOneRoundPairsFromMoved(movedTiles),
    ): void {
        if (!pairs.length) {
            this.restoreMovedTiles(movedTiles, origins);
            return;
        }

        this.eliminatePairs(pairs);
    }

    private isTileOnOwnLayerGrid(tile: TileView): boolean {
        return isValid(tile, true)
            && !tile.eliminated
            && this.grids[tile.layer]?.[tile.row]?.[tile.col] === tile;
    }

    private findPairForTile(
        grid: Array<Array<TileView | null>>,
        tile: TileView,
    ): TileView | null {
        const directions: Array<[number, number]> = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ];
        for (const [dr, dc] of directions) {
            let row = tile.row + dr;
            let col = tile.col + dc;
            while (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
                const other = grid[row][col];
                if (other) {
                    const matched = !other.eliminated && other.matchKey === tile.matchKey;
                    if (matched) {
                        return other;
                    }
                    break;
                }
                row += dr;
                col += dc;
            }
        }
        return null;
    }

    private eliminatePairs(
        pairs: Array<[TileView, TileView]>,
        afterRemoved?: () => void,
    ): void {
        if (!pairs.length) return;
        this.inputLocked = true;
        this.updateCombo(pairs.length);
        const perPair = 120 + 20 * Math.max(0, Math.min(this.combo, 5) - 1);
        this.totalScore += perPair * pairs.length;
        this.animateScoreToTotal();
        this.playOneShot(this.eliminateAudio);
        this.drawPairLines(pairs);
        for (const [a, b] of pairs) {
            const midpoint = new Vec3(
                (a.node.position.x + b.node.position.x) * 0.5,
                (a.node.position.y + b.node.position.y) * 0.5,
                0,
            );
            this.spawnFloatingScore(midpoint, perPair);
        }

        const unique = new Set<TileView>();
        for (const [a, b] of pairs) {
            unique.add(a);
            unique.add(b);
        }
        for (const tile of unique) {
            if (this.cascadeLayer < 0) {
                this.cascadeLayer = tile.layer;
            }
            this.cascadeRows.add(tile.row);
            this.cascadeCols.add(tile.col);
        }
        for (const tile of unique) {
            this.grids[tile.layer][tile.row][tile.col] = null;
            tile.eliminated = true;
            tile.node.active = false;
            const index = this.allTiles.indexOf(tile);
            if (index >= 0) {
                this.allTiles.splice(index, 1);
            }
            if (isValid(tile.node, true)) {
                tile.node.destroy();
            }
        }
        afterRemoved?.();
        this.afterEliminate();
    }

    private afterEliminate(): void {
        this.currentLayer = this.findTopOccupiedLayer();
        if (this.currentLayer < 0) {
            this.finishGame(true);
            return;
        }
        this.refreshLayerVisibility();
        this.cascadeRows.clear();
        this.cascadeCols.clear();
        this.cascadeLayer = -1;
        this.inputLocked = false;
        this.ensurePlayable();
    }

    private updateCombo(amount: number): void {





        this.combo += amount;
        this.lastEliminateAt = this.elapsed;
        if (this.combo >= 2) {
            this.comboRoot && (this.comboRoot.active = true);
            if (this.comboLabel) this.comboLabel.string = `×${this.combo}`;
            if (this.comboRoot) {
                this.comboRoot.setScale(0.7, 0.7, 1);
                tween(this.comboRoot).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
            }
        }
    }

    private ensurePlayable(): void {
        const hint = this.findHint();
        if (!hint && !this.gameEnded) {
            this.shuffleCurrentLayer();
        }
    }

    private showHint(opening: boolean): void {
        if (this.gameEnded || this.inputLocked || this.drag) return;
        this.clearHint();
        let hint = this.findHint();
        if (!hint) {
            this.shuffleCurrentLayer();
            hint = this.findHint();
        }
        if (!hint) return;

        this.hintTiles = hint.pair ? [hint.pair[0], hint.pair[1]] : [hint.anchor];
        for (const tile of this.hintTiles) tile.setHint(true);
        if (this.guideHand) {
            this.guideHand.active = true;
            const start = hint.anchor.node.position.clone();
            this.guideHand.setPosition(start);
            if (hint.direction && hint.steps) {
                const end = start.clone();
                if (hint.direction === 'left') end.x -= hint.steps * this.cellSpacingX;
                if (hint.direction === 'right') end.x += hint.steps * this.cellSpacingX;
                if (hint.direction === 'up') end.y += hint.steps * this.cellSpacingY;
                if (hint.direction === 'down') end.y -= hint.steps * this.cellSpacingY;
                tween(this.guideHand)
                    .repeatForever(tween().to(0.8, { position: end }).delay(0.15).set({ position: start }))
                    .start();
            } else {
                tween(this.guideHand)
                    .repeatForever(tween().to(0.35, { scale: new Vec3(0.8, 0.8, 1) }).to(0.35, { scale: Vec3.ONE }))
                    .start();
            }
        }
        if (opening) this.idleElapsed = 0;
    }

    private findHint(): HintMove | null {
        const grid = this.grids[this.currentLayer];
        const tiles = this.getCurrentTiles();
        for (const tile of tiles) {
            const pair = this.findPairForTile(grid, tile);
            if (pair) return { anchor: tile, pair: [tile, pair] };
        }
        const directions: Direction[] = ['left', 'right', 'up', 'down'];
        for (const tile of tiles) {
            for (const direction of directions) {
                const movement = this.collectSegment(tile, direction);
                for (let steps = 1; steps <= movement.maxStep; steps++) {
                    if (this.simulatedMoveCreatesPair(movement.segment, direction, steps)) {
                        return { anchor: tile, direction, steps };
                    }
                }
            }
        }
        return null;
    }

    private simulatedMoveCreatesPair(segment: TileView[], direction: Direction, steps: number): boolean {
        const source = this.grids[this.currentLayer];
        const clone = source.map(row => row.slice());
        const dr = direction === 'up' ? -steps : direction === 'down' ? steps : 0;
        const dc = direction === 'left' ? -steps : direction === 'right' ? steps : 0;
        for (const tile of segment) clone[tile.row][tile.col] = null;
        const oldPositions = segment.map(tile => [tile.row, tile.col] as [number, number]);
        for (const tile of segment) {
            tile.row += dr;
            tile.col += dc;
            clone[tile.row][tile.col] = tile;
        }
        const hasPair = segment.some(tile => !!this.findPairForTile(clone, tile));
        segment.forEach((tile, index) => {
            tile.row = oldPositions[index][0];
            tile.col = oldPositions[index][1];
        });
        return hasPair;
    }

    private shuffleCurrentLayer(): void {
        const tiles = this.getCurrentTiles();
        if (tiles.length < 2) return;
        this.clearHint();
        const types = tiles.map(tile => tile.typeId);
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        tiles.forEach((tile, index) => tile.setType(types[index], this.tileFrames[types[index]]));

        if (!this.findHint()) {
            const pairType = types.find(type => types.filter(value => value === type).length >= 2);
            if (pairType !== undefined) {
                for (const first of tiles) {
                    const neighbor = this.findVisibleNeighbor(first);
                    if (!neighbor) continue;
                    first.setType(pairType, this.tileFrames[pairType]);
                    neighbor.setType(pairType, this.tileFrames[pairType]);
                    break;
                }
            }
        }
        for (const tile of tiles) {
            tile.node.setScale(0.8, 0.8, 1);
            tween(tile.node).to(0.2, { scale: Vec3.ONE }).start();
        }
    }

    private findVisibleNeighbor(tile: TileView): TileView | null {
        const grid = this.grids[this.currentLayer];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of directions) {
            let row = tile.row + dr;
            let col = tile.col + dc;
            while (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
                const other = grid[row][col];
                if (other) return other;
                row += dr;
                col += dc;
            }
        }
        return null;
    }

    private onUserActivity(): void {
        this.idleElapsed = 0;
        this.clearHint();
    }

    private clearHint(): void {
        for (const tile of this.hintTiles) {
            if (isValid(tile, true) && isValid(tile.node, true) && !tile.eliminated) {
                tile.setHint(false);
            }
        }
        this.hintTiles.length = 0;
        if (this.guideHand) {
            tween(this.guideHand).stop();
            this.guideHand.active = false;
            this.guideHand.setScale(Vec3.ONE);
        }
    }

    private canInteract(tile: TileView): boolean {
        return !this.gameEnded
            && !this.inputLocked
            && !tile.eliminated
            && tile.layer === this.currentLayer;
    }

    private findTopOccupiedLayer(): number {
        for (let layer = this.layerCount - 1; layer >= 0; layer--) {
            for (let row = 0; row < this.rows; row++) {
                if (this.grids[layer]?.[row]?.some(tile => !!tile && !tile.eliminated)) return layer;
            }
        }
        return -1;
    }

    private refreshLayerVisibility(): void {
        for (const tile of this.allTiles) {
            if (!isValid(tile, true) || !isValid(tile.node, true) || tile.eliminated) continue;
            const active = tile.layer <= this.currentLayer;
            tile.node.active = active;
            tile.setBlocked(tile.layer !== this.currentLayer);
        }
    }

    private getCurrentTiles(): TileView[] {
        return this.allTiles.filter(tile => {
            if (!isValid(tile, true)) return false;
            const node = tile.node;
            return isValid(node, true)
                && !tile.eliminated
                && tile.layer === this.currentLayer;
        });
    }

    private cellPosition(row: number, col: number, layer: number): Vec3 {
        const x = (col - (this.cols - 1) / 2) * this.cellSpacingX;
        const y = ((this.rows - 1) / 2 - row) * this.cellSpacingY + layer * 4;
        return new Vec3(x, y, layer);
    }

    private refreshHud(): void {
        this.refreshScore();
        this.refreshTime();
    }

    private refreshScore(): void {
        this.displayedScore = this.totalScore;
        this.scoreAnimationFrom = this.totalScore;
        this.scoreAnimationElapsed = this.scoreAnimationDuration;
        if (this.scoreLabel) this.scoreLabel.string = Math.floor(this.displayedScore).toString();
    }

    private animateScoreToTotal(): void {
        this.scoreAnimationFrom = this.displayedScore;
        this.scoreAnimationElapsed = 0;
        if (this.scoreLabel) {
            Tween.stopAllByTarget(this.scoreLabel.node);
            this.scoreLabel.node.setScale(1, 1, 1);
            tween(this.scoreLabel.node)
                .to(0.09, { scale: new Vec3(1.18, 1.18, 1) })
                .to(0.16, { scale: Vec3.ONE })
                .start();
        }
    }

    private updateScoreAnimation(dt: number): void {
        if (this.displayedScore === this.totalScore) return;
        this.scoreAnimationElapsed = Math.min(
            this.scoreAnimationDuration,
            this.scoreAnimationElapsed + dt,
        );
        const progress = this.scoreAnimationDuration > 0
            ? this.scoreAnimationElapsed / this.scoreAnimationDuration
            : 1;
        const eased = 1 - Math.pow(1 - progress, 3);
        const nextValue = this.scoreAnimationFrom
            + (this.totalScore - this.scoreAnimationFrom) * eased;
        this.displayedScore = progress >= 1
            ? this.totalScore
            : Math.min(this.totalScore, Math.floor(nextValue));
        if (this.scoreLabel) this.scoreLabel.string = this.displayedScore.toString();
    }

    private refreshTime(): void {
        const seconds = Math.ceil(this.remainingSeconds);
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        if (this.timeLabel) this.timeLabel.string = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        if (this.timeProgress) this.timeProgress.progress = this.totalSeconds > 0
            ? this.remainingSeconds / this.totalSeconds
            : 0;
        if (this.lowTimeWarning) this.lowTimeWarning.active = this.remainingSeconds > 0 && this.remainingSeconds <= 10;
    }

    private finishGame(victory: boolean): void {
        if (this.gameEnded) return;
        this.gameEnded = true;
        this.inputLocked = true;
        this.clearHint();
        this.comboRoot && (this.comboRoot.active = false);
        for (const label of this.resultScoreLabels) {
            if (label) label.string = Math.floor(this.totalScore).toString();
        }
        if (victory) {
            this.victoryPanel && (this.victoryPanel.active = true);
            this.playVictoryEffects();
            this.playOneShot(this.victoryAudio);
        } else {
            this.failPanel && (this.failPanel.active = true);
            this.playOneShot(this.failAudio);
        }
    }

    private playVictoryEffects(): void {
        const guang = this.victoryPanel?.getChildByName('guang') || null;
        if (guang) {
            Tween.stopAllByTarget(guang);
            guang.angle = 0;
            tween(guang)
                .repeatForever(tween<Node>().by(4.8, { angle: 360 }))
                .start();
        }
        this.scheduleOnce(() => this.openStoreUrl(), 2);
    }

    private stopVictoryEffects(): void {
        const guang = this.victoryPanel?.getChildByName('guang') || null;
        if (guang) Tween.stopAllByTarget(guang);
    }

    private openStoreUrl(): void {
        sys.openURL(this.appStoreUrl);
    }

    private playOneShot(clip: AudioClip | null): void {
        if (clip && this.audioSource) this.audioSource.playOneShot(clip, 1);
    }

    private resolveLineGraphics(): void {
        const boundNode = this.lineGraphics && isValid(this.lineGraphics, true) && isValid(this.lineGraphics.node, true) ? this.lineGraphics.node : null;
        const lineNode = boundNode
            || this.boardRoot?.parent?.getChildByName('LineLayer')
            || this.node.getChildByName('LineLayer')
            || this.node.getChildByPath?.('BoardArea/LineLayer')
            || null;
        if (lineNode?.parent) lineNode.setSiblingIndex(lineNode.parent.children.length - 1);
        this.lineGraphics = lineNode?.getComponent(Graphics) || null;
    }

    private drawPairLines(pairs: Array<[TileView, TileView]>): void {
        this.resolveLineGraphics();
        if (!this.lineGraphics || !this.boardRoot) {
            return;
        }
        const graphicsTransform = this.lineGraphics.node.getComponent(UITransform);
        this.lineGraphics.clear();
        this.lineGraphics.lineWidth = 14;
        this.lineGraphics.strokeColor = new Color(255, 226, 53, 255);
        for (const [a, b] of pairs) {
            const aWorld = a.node.worldPosition.clone();
            const bWorld = b.node.worldPosition.clone();
            const aLocal = graphicsTransform ? graphicsTransform.convertToNodeSpaceAR(aWorld) : a.node.position;
            const bLocal = graphicsTransform ? graphicsTransform.convertToNodeSpaceAR(bWorld) : b.node.position;
            this.lineGraphics.moveTo(aLocal.x, aLocal.y);
            this.lineGraphics.lineTo(bLocal.x, bLocal.y);
        }
        this.lineGraphics.stroke();
        const serial = ++this.lineClearSerial;
        this.scheduleOnce(() => {
            if (serial === this.lineClearSerial) {
                this.lineGraphics?.clear();
            }
        }, 0.28);
    }

    private spawnFloatingScore(position: Vec3, score: number): void {
        if (!this.boardRoot) return;
        this.resolveLineGraphics();
        const effectRoot = this.lineGraphics?.node || this.boardRoot;
        const node = this.floatingScorePrefab ? instantiate(this.floatingScorePrefab) : this.createFloatingScoreNode();
        effectRoot.addChild(node);
        this.applyNodeLayer(node, effectRoot.layer);
        const boardTransform = this.boardRoot.getComponent(UITransform);
        const effectTransform = effectRoot.getComponent(UITransform);
        const displayPosition = boardTransform && effectTransform
            ? effectTransform.convertToNodeSpaceAR(boardTransform.convertToWorldSpaceAR(position))
            : position;
        node.setPosition(displayPosition.x, displayPosition.y + 16, displayPosition.z);
        const label = node.getComponent(Label) || node.getComponentInChildren(Label);
        const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        if (label) label.string = `+${score}`;
        opacity.opacity = 255;
        node.setScale(0.35, 0.35, 1);
        node.setSiblingIndex(node.parent ? node.parent.children.length - 1 : 0);
        tween(node)
            .to(0.10, { scale: new Vec3(1.32, 1.32, 1) })
            .to(0.12, { scale: new Vec3(0.96, 0.96, 1) })
            .to(0.12, { scale: Vec3.ONE })
            .start();
        tween(node)
            .by(0.68, { position: new Vec3(0, 92, 0) })
            .call(() => isValid(node, true) && node.destroy())
            .start();
        tween(opacity)
            .delay(0.24)
            .to(0.44, { opacity: 0 })
            .start();
    }

    private createFloatingScoreNode(): Node {
        const node = new Node('FloatingScore');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(250, 108);
        const label = node.addComponent(Label);
        label.string = '+0';
        label.fontSize = 68;
        label.lineHeight = 78;
        label.color = new Color(80, 205, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 255);
        label.outlineWidth = 7;
        label.enableShadow = true;
        label.shadowColor = new Color(0, 0, 0, 180);
        label.shadowOffset = new Vec2(0, -4);
        label.shadowBlur = 1;
        node.addComponent(UIOpacity);
        return node;
    }

    private applyNodeLayer(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyNodeLayer(child, layer);
        }
    }

    private clearBoard(): void {
        this.clearHint();
        this.drag = null;
        this.allTiles.length = 0;
        this.grids.length = 0;
        this.cascadeRows.clear();
        this.cascadeCols.clear();
        this.cascadeLayer = -1;
        this.lineGraphics?.clear();
        if (this.boardRoot) {
            const children = this.boardRoot.children.slice();
            for (const child of children) child.destroy();
        }
    }
}
