import {
    _decorator,
    Color,
    Component,
    EventTouch,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UITransform,
    Vec3,
} from 'cc';
import type { GameController } from './GameController';

const { ccclass, property } = _decorator;

@ccclass('TileView')
export class TileView extends Component {
    @property(Sprite)
    public frontBase: Sprite | null = null;

    @property(Sprite)
    public face: Sprite | null = null;

    @property(Node)
    public blockedMask: Node | null = null;

    @property(Node)
    public selectedMark: Node | null = null;

    @property(Node)
    public hintMark: Node | null = null;

    public controller: GameController | null = null;
    public typeId = -1;
    public matchKey = '';
    public row = -1;
    public col = -1;
    public layer = -1;
    public eliminated = false;

    private readonly _baseScale = new Vec3(1, 1, 1);

    protected onLoad(): void {
        this.resolveVisualNodes();
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        this.selectedMark && (this.selectedMark.active = false);
        this.hintMark && (this.hintMark.active = false);
        if (this.frontBase && this.face) {
            this.frontBase.node.setSiblingIndex(0);
            this.face.node.setSiblingIndex(1);
        }
        this.ensureBlockedMask();
    }

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    public setup(
        controller: GameController,
        typeId: number,
        frame: SpriteFrame,
        row: number,
        col: number,
        layer: number,
    ): void {
        this.controller = controller;
        this.row = row;
        this.col = col;
        this.layer = layer;
        this.eliminated = false;
        this.node.active = true;
        if (this.frontBase) {
            this.frontBase.node.active = true;
            this.frontBase.color = Color.WHITE;
        }
        this.setBlocked(false);
        this.setType(typeId, frame);
        this.setSelected(false);
        this.setHint(false);
    }

    public setType(typeId: number, frame: SpriteFrame): void {
        this.typeId = typeId;
        this.matchKey = frame.uuid || `type-${typeId}`;
        if (this.face) {
            this.face.spriteFrame = frame;
            this.face.color = Color.WHITE;
        }
    }

    public setBlocked(blocked: boolean): void {
        this.ensureBlockedMask();
        if (this.face) {
            this.face.grayscale = false;
            this.face.color = Color.WHITE;
        }
        if (this.frontBase) {
            this.frontBase.grayscale = false;
            this.frontBase.color = Color.WHITE;
        }
        if (this.blockedMask) {
            this.blockedMask.active = blocked;
        }
    }

    public setSelected(selected: boolean): void {
        this.selectedMark && (this.selectedMark.active = selected);
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.08, { scale: selected ? new Vec3(1.1, 1.1, 1) : this._baseScale })
            .start();
    }

    public setHint(show: boolean): void {
        this.hintMark && (this.hintMark.active = show);
        if (!show) {
            Tween.stopAllByTarget(this.node);
            this.node.setScale(this._baseScale);
            return;
        }
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .repeatForever(
                tween()
                    .to(0.35, { scale: new Vec3(1.12, 1.12, 1) })
                    .to(0.35, { scale: this._baseScale }),
            )
            .start();
    }

    public playEliminate(done: () => void): void {
        this.eliminated = true;
        Tween.stopAllByTarget(this.node);
        this.hintMark && (this.hintMark.active = false);
        this.selectedMark && (this.selectedMark.active = false);
        let completed = false;
        const finish = (): void => {
            if (completed) return;
            completed = true;
            done();
        };
        tween(this.node)
            .to(0.12, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.18, { scale: new Vec3(0, 0, 1) })
            .call(finish)
            .start();
        this.scheduleOnce(finish, 0.4);
    }

    private onTouchStart(event: EventTouch): void {
        this.controller?.onTileTouchStart(this, event);
    }

    private onTouchMove(event: EventTouch): void {
        this.controller?.onTileTouchMove(this, event);
    }

    private onTouchEnd(event: EventTouch): void {
        this.controller?.onTileTouchEnd(this, event);
    }

    private onTouchCancel(event: EventTouch): void {
        this.controller?.onTileTouchCancel(this, event);
    }

    private ensureBlockedMask(): void {
        this.resolveVisualNodes();
        if (this.blockedMask || !this.frontBase) {
            return;
        }
        const baseTransform = this.frontBase.node.getComponent(UITransform);
        const maskNode = new Node('BlockedMask');
        maskNode.layer = this.frontBase.node.layer;
        const maskTransform = maskNode.addComponent(UITransform);
        const maskSprite = maskNode.addComponent(Sprite);
        maskSprite.spriteFrame = this.frontBase.spriteFrame;
        maskSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        maskSprite.customMaterial = this.frontBase.customMaterial;
        maskSprite.color = new Color(12, 16, 14, 200);
        if (baseTransform) {
            maskTransform.setContentSize(baseTransform.contentSize);
            maskTransform.setAnchorPoint(baseTransform.anchorPoint);
        }
        this.node.addChild(maskNode);
        maskNode.setPosition(this.frontBase.node.position);
        maskNode.setRotation(this.frontBase.node.rotation);
        maskNode.setScale(this.frontBase.node.scale);
        maskNode.setSiblingIndex(this.face
            ? Math.min(this.face.node.getSiblingIndex() + 1, this.node.children.length - 1)
            : this.node.children.length - 1);
        maskNode.active = false;
        this.blockedMask = maskNode;
    }

    private resolveVisualNodes(): void {
        if (!this.frontBase) {
            this.frontBase = this.node.getChildByName('FrontBase')?.getComponent(Sprite) || null;
        }
        if (!this.face) {
            this.face = this.node.getChildByName('Face')?.getComponent(Sprite) || null;
        }
        if (!this.blockedMask) {
            this.blockedMask = this.node.getChildByName('BlockedMask') || null;
        }
    }
}
