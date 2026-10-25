import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * 按需加载的界面模块（入口块预算，#112）：第一次需要时导入；加载过之后同步可用，挂载新的组件不再等一次（React.lazy 每次初次渲染
 * 都会挂起）。加载失败时下次需要再试。与 useWorkbenchPanelColumns 加载 workbenchMultiPanel 的做法相同。
 */
export function createLazyModule<Module>(loader: () => Promise<Module>) {
  let loaded: Module | null = null;
  let loading: Promise<Module> | null = null;
  const loadedListeners = new Set<() => void>();
  const load = (): Promise<Module> => {
    loading ??= loader().then(
      (module) => {
        loaded = module;
        for (const listener of loadedListeners) listener();
        return module;
      },
      (error: unknown) => {
        loading = null;
        throw error;
      }
    );
    return loading;
  };
  const useModule = (): Module | null => {
    const [module, setModule] = useState<Module | null>(loaded);
    useEffect(() => {
      if (module) return;
      let live = true;
      load().then((next) => {
        if (live) setModule(next);
      }, () => undefined);
      return () => {
        live = false;
      };
    }, [module]);
    return module ?? loaded;
  };
  /** 模块是否已经加载过；只订阅，不触发加载（打开它的按钮据此判断浮层是否真的挂上了） */
  const useLoaded = (): boolean => useSyncExternalStore(
    (listener) => {
      loadedListeners.add(listener);
      return () => loadedListeners.delete(listener);
    },
    () => loaded !== null,
    () => false
  );
  return { load, useModule, useLoaded };
}
