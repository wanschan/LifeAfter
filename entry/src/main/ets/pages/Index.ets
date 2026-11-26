import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common } from '@kit.AbilityKit';

const DOMAIN: number = 0x5A1F;
const TAG: string = 'LifeAfterWeb';

/**
 * 余烬纪 · 鸿蒙承载页
 *
 * 整个游戏（标题页 / 序章 / 3D 大地图 / 80 个剧情节点 / 25 张分场插画）
 * 是一个自包含 HTML，放在 rawfile 里由 ArkWeb 加载。
 * 生成方式：python scripts/build_harmony_html.py
 */
@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private isLoading: boolean = true;
  @State private hasError: boolean = false;
  @State private errorMessage: string = '';

  aboutToAppear(): void {
    // 打开 WebView 调试开关无需网络权限；仅开发期有用
    try {
      webview.WebviewController.setWebDebuggingAccess(true);
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'setWebDebuggingAccess failed: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * 返回键：onBackPress 是同步的，而 runJavaScript 是异步回调，
   * 所以这里先占用返回键，由网页回调决定是逐层回退还是退出应用。
   */
  onBackPress(): boolean {
    try {
      this.controller.runJavaScript(
        'typeof window.__appBack === "function" ? String(window.__appBack()) : "false"',
        (err: Error, result: string) => {
          if (err) {
            hilog.error(DOMAIN, TAG, 'back bridge error: %{public}s', JSON.stringify(err));
            return;
          }
          if (result !== 'true') {
            const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
            if (ctx) {
              ctx.terminateSelf();
            }
          }
        });
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'back failed: %{public}s', JSON.stringify(err));
    }
    return true;
  }

  build() {
    Stack() {
      Web({
        src: $rawfile('index.html'),
        controller: this.controller
      })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.All)
        .cacheMode(CacheMode.Default)
        .backgroundColor('#080706')
        .onPageEnd(() => {
          this.isLoading = false;
          this.hasError = false;
          hilog.info(DOMAIN, TAG, 'page loaded');
          // 诊断 WebGL 与地图引擎状态，便于排查降级为纸图的原因
          this.controller.runJavaScript(
            'typeof window.__diag === "function" ? window.__diag() : "no diag"',
            (err: Error, result: string) => {
              if (err) {
                hilog.error(DOMAIN, TAG, 'diag error: %{public}s', JSON.stringify(err));
              } else {
                hilog.info(DOMAIN, TAG, 'DIAG %{public}s', result);
              }
            });
        })
        .onErrorReceive((event) => {
          this.isLoading = false;
          this.hasError = true;
          this.errorMessage = event.error ? event.error.getErrorInfo() : '未知错误';
          hilog.error(DOMAIN, TAG, 'load error: %{public}s', this.errorMessage);
        })
        // 把网页 console 转发到 hilog：调试布局/渲染问题时唯一能看到真实数值的通道
        .onConsole((event) => {
          try {
            hilog.info(DOMAIN, TAG, 'JS %{public}s', event.message.getMessage());
          } catch (err) {
            hilog.warn(DOMAIN, TAG, 'console forward failed');
          }
          return true;
        })

      if (this.isLoading) {
        Column() {
          Progress({ value: 0, total: 100, type: ProgressType.Ring })
            .width(48)
            .height(48)
            .color('#c9a24a');
          Text('余烬纪 · 正在进入废土')
            .fontSize(13)
            .fontColor('#8a826f')
            .margin({ top: 18 });
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#080706');
      }

      if (this.hasError) {
        Column() {
          Text('加载失败')
            .fontSize(20)
            .fontColor('#e8dcc4')
            .fontWeight(FontWeight.Bold);
          Text(this.errorMessage)
            .fontSize(12)
            .fontColor('#9a917f')
            .margin({ top: 12 })
            .padding({ left: 24, right: 24 })
            .textAlign(TextAlign.Center);
          Button('重试')
            .margin({ top: 24 })
            .fontColor('#1a1610')
            .backgroundColor('#c9a24a')
            .onClick(() => {
              this.hasError = false;
              this.isLoading = true;
              this.controller.refresh();
            });
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#080706');
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#080706')
    // 让网页铺满整块屏幕：不加这句，ArkUI 会按安全区把内容往下挤一条状态栏的高度，
    // 游戏自己的 HUD 已经留了边距，不需要系统再让位。
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
  }
}
