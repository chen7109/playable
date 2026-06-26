import { _decorator, Component } from 'cc';
import { GameController } from './GameController';

const { ccclass, property } = _decorator;

@ccclass('RestartButton')
export class RestartButton extends Component {
    @property(GameController)
    public game: GameController | null = null;

    public restart(): void {
        this.game?.restartGame();
    }
}
