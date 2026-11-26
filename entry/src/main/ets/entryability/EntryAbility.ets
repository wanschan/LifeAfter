import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x0000;

export default class EntryAbility extends UIAbility {
  /**
   * 沉浸式：游戏画面铺满整屏。
   * setWindowSystemBarEnable([]) 直接把状态栏和导航条隐藏掉，
   * 比只做 layoutFullScreen 更彻底（否则状态栏会盖住标题页左上角）。
   */
  private applyImmersive(windowStage: window.WindowStage): void {
    try {
      const mainWindow = windowStage.getMainWindowSync();
      mainWindow.setWindowLayoutFullScreen(true);
      mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#080706',
        statusBarContentColor: '#c9a24a',
        navigationBarColor: '#080706',
        navigationBarContentColor: '#c9a24a'
      });
      mainWindow.setWindowSystemBarEnable([]).catch((err: Error) => {
        hilog.warn(DOMAIN, 'testTag', 'hide system bar failed: %{public}s', err.message);
      });
    } catch (err) {
      hilog.error(DOMAIN, 'testTag', 'set fullscreen failed: %{public}s', JSON.stringify(err));
    }
  }

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onCreate');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Main window is created, set main page for this ability
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onWindowStageCreate');

    // 沉浸式：让游戏画面延伸到状态栏 / 导航条区域
    this.applyImmersive(windowStage);

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, 'testTag', 'Failed to load the content. Cause: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, 'testTag', 'Succeeded in loading the content.');
      // 部分设备要在内容加载完、窗口 attach 之后再设置一次才生效
      this.applyImmersive(windowStage);
    });

    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (err) {
      hilog.error(DOMAIN, 'testTag', 'Failed to set colorMode. Cause: %{public}s', JSON.stringify(err));
    }
  }

  onWindowStageDestroy(): void {
    // Main window is destroyed, release UI related resources
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    // Ability has brought to foreground
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onForeground');
  }

  onBackground(): void {
    // Ability has back to background
    hilog.info(DOMAIN, 'testTag', '%{public}s', 'Ability onBackground');
  }
}