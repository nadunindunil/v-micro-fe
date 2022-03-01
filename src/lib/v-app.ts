const globalTimeoutConfig = {
  bootstrap: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: 1000,
  },
  mount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: 1000,
  },
  unmount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: 1000,
  },
  unload: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: 1000,
  },
  update: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: 1000,
  },
};

function toUpdatePromise(vBundle: any) {
  return Promise.resolve().then(() => {
    if (vBundle.status !== MOUNTED) {
      throw Error(
        `Cannot update vBundle '${toName(
          vBundle
        )}' because it is not mounted, status ${vBundle.status}`
      );
    }

    vBundle.status = UPDATING;

    return reasonableTime(vBundle, 'update')
      .then(() => {
        vBundle.status = MOUNTED;
        return vBundle;
      })
      .catch((err) => {
        //   throw transformErr(err, vBundle, SKIP_BECAUSE_BROKEN);
        console.error(err);
      });
  });
}

function toUnmountPromise(microFe: any, hardFail: any) {
  return Promise.resolve().then(() => {
    if (microFe.status !== MOUNTED) {
      return microFe;
    }
    microFe.status = UNMOUNTING;

    const unmountChildrenVBundles = Object.keys(microFe.vBundles).map(
      (vBundleId) => microFe.vBundles[vBundleId].unmountThisVBundle()
    );

    const vBundleError: any = null;

    return Promise.all(unmountChildrenVBundles)
      .then(unmountMicroFe, (vBundleError) => {
        // There is a vBundle unmount error
        return unmountMicroFe().then(() => {
          // Unmounting the app/vBundle succeeded, but unmounting its children vBundles did not
          const parentError = Error(vBundleError.message);
          // if (hardFail) {
          //   throw transformErr(parentError, microFe, SKIP_BECAUSE_BROKEN);
          // } else {
          //   handleAppError(parentError, microFe, SKIP_BECAUSE_BROKEN);
          // }
          console.error(parentError, hardFail);
        });
      })
      .then(() => microFe);

    function unmountMicroFe() {
      // We always try to unmount the microFe, even if the children vBundles failed to unmount.
      return reasonableTime(microFe, 'unmount')
        .then(() => {
          // The microFe needs to stay in a broken status if its children vBundles fail to unmount
          if (!vBundleError) {
            microFe.status = NOT_MOUNTED;
          }
        })
        .catch((err) => {
          // if (hardFail) {
          //   throw transformErr(err, microFe, SKIP_BECAUSE_BROKEN);
          // } else {
          //   handleAppError(err, microFe, SKIP_BECAUSE_BROKEN);
          // }
          console.error(err);
        });
    }
  });
}

function toBootstrapPromise(microFe: any, hardFail: any) {
  return Promise.resolve().then(() => {
    if (microFe.status !== NOT_BOOTSTRAPPED) {
      return microFe;
    }

    microFe.status = BOOTSTRAPPING;

    if (!microFe.bootstrap) {
      // Default implementation of bootstrap
      return Promise.resolve().then(successfulBootstrap);
    }

    return reasonableTime(microFe, 'bootstrap')
      .then(successfulBootstrap)
      .catch((err) => {
        console.log('error in bootstrap', err, hardFail);
        // if (hardFail) {
        //   throw transformErr(err, microFe, SKIP_BECAUSE_BROKEN);
        // } else {
        //   handleAppError(err, microFe, SKIP_BECAUSE_BROKEN);
        //   return microFe;
        // }
      });
  });

  function successfulBootstrap() {
    microFe.status = NOT_MOUNTED;
    return microFe;
  }
}

let beforeFirstMountFired = false;
let firstMountFired = false;

export function toMountPromise(microFe: any, hardFail: any) {
  return Promise.resolve().then(() => {
    if (microFe.status !== NOT_MOUNTED) {
      return microFe;
    }

    if (!beforeFirstMountFired) {
      //   window.dispatchEvent(new CustomEvent("v-app:before-first-mount"));
      beforeFirstMountFired = true;
    }

    return reasonableTime(microFe, 'mount')
      .then(() => {
        microFe.status = MOUNTED;

        console.log('--------------------mounted');
        if (!firstMountFired) {
          //   window.dispatchEvent(new CustomEvent("v-app:first-mount"));
          firstMountFired = true;
        }

        return microFe;
      })
      .catch((err) => {
        // If we fail to mount the microFe, we should attempt to unmount it before putting in SKIP_BECAUSE_BROKEN
        // We temporarily put the microFe into MOUNTED status so that toUnmountPromise actually attempts to unmount it
        // instead of just doing a no-op.
        microFe.status = MOUNTED;
        return toUnmountPromise(microFe, true).then(
          setSkipBecauseBroken,
          setSkipBecauseBroken
        );

        function setSkipBecauseBroken() {
          if (!hardFail) {
            // handleAppError(err, microFe, SKIP_BECAUSE_BROKEN);
            microFe.status = SKIP_BECAUSE_BROKEN;
            return microFe;
          } else {
            console.log('in error', err);
            // throw transformErr(err, microFe, SKIP_BECAUSE_BROKEN);
          }
        }
      });
  });
}

function assign(...args: any[]) {
  console.log(args);
  for (let i = args.length - 1; i > 0; i--) {
    for (let key in args[i]) {
      if (key === '__proto__') {
        continue;
      }
      args[i - 1][key] = args[i][key];
    }
  }

  return args[0];
}

function toName(app: any) {
  return app.name;
}

function getProps(microFe: any) {
  const name = toName(microFe);
  //   let customProps =
  //     typeof microFe.customProps === "function"
  //       ? microFe.customProps(name, window.location)
  //       : microFe.customProps;
  //   if (
  //     typeof customProps !== "object" ||
  //     customProps === null ||
  //     Array.isArray(customProps)
  //   ) {
  //     customProps = {};
  //     console.warn(
  //       `v-app: ${name}'s customProps function must return an object. Received ${customProps}`
  //     );
  //   }

  const result = assign({}, microFe.customProps, {
    name,
    mountVBundle: mountVApp.bind(microFe),
  });

  result.unmountSelf = microFe.unmountThisVBundle;

  return result;
}

function reasonableTime(microFe: any, lifecycle: any) {
  const timeoutConfig = microFe.timeouts[lifecycle];
  const warningPeriod = timeoutConfig.warningMillis;

  return new Promise((resolve, reject) => {
    let finished = false;
    let errored = false;

    console.log(lifecycle);

    microFe[lifecycle](getProps(microFe))
      .then((val: any) => {
        finished = true;
        resolve(val);
      })
      .catch((val: any) => {
        finished = true;
        reject(val);
      });

    setTimeout(() => maybeTimingOut(1), warningPeriod);
    setTimeout(() => maybeTimingOut(true), timeoutConfig.millis);

    const errMsg = 'resolve error in reason promise';

    function maybeTimingOut(shouldError: any) {
      if (!finished) {
        if (shouldError === true) {
          errored = true;
          if (timeoutConfig.dieOnTimeout) {
            reject(Error(errMsg));
          } else {
            console.error(errMsg);
            //don't resolve or reject, we're waiting this one out
          }
        } else if (!errored) {
          const numWarnings = shouldError;
          const numMillis = numWarnings * warningPeriod;
          console.warn(errMsg);
          if (numMillis + warningPeriod < timeoutConfig.millis) {
            setTimeout(() => maybeTimingOut(numWarnings + 1), warningPeriod);
          }
        }
      }
    }
  });
}

export function flattenFnArray(microFe: any, lifecycle: string) {
  let fns = microFe[lifecycle] || [];
  fns = Array.isArray(fns) ? fns : [fns];
  if (fns.length === 0) {
    fns = [() => Promise.resolve()];
  }

  return function (props: any) {
    // todo: check index removal (resultPromise: any, fn: any, index: any)
    return fns.reduce((resultPromise: any, fn: any) => {
      return resultPromise.then(() => {
        const thisPromise = fn(props);
        return thisPromise;
      });
    }, Promise.resolve());
  };
}

const LOADING_SOURCE_CODE = 'LOADING_SOURCE_CODE';
const NOT_BOOTSTRAPPED = 'NOT_BOOTSTRAPPED';
const BOOTSTRAPPING = 'BOOTSTRAPPING';
const NOT_MOUNTED = 'NOT_MOUNTED';
// const MOUNTING = 'MOUNTING';
const MOUNTED = 'MOUNTED';
const UPDATING = 'UPDATING';
const UNMOUNTING = 'UNMOUNTING';
// const UNLOADING = 'UNLOADING';
// const LOAD_ERROR = 'LOAD_ERROR';
const SKIP_BECAUSE_BROKEN = 'SKIP_BECAUSE_BROKEN';

export class VApp {
  private _vBundle: any;
  private _loadPromise: any;
  private _bootstrapPromise: any;
  private _mountPromise: any;
  private _unmountPromise: any;
  private _updatePromise: any;

  public getRootComponent(): any {
    return this._vBundle.customRoot;
  }

  public setUpdatePromise(): any {
    this._updatePromise = (customProps: any) => {
      this._vBundle.customProps = customProps;
      return promiseWithoutReturnValue(toUpdatePromise(this._vBundle));
    };
  }

  public setVBundle(vBundle: any): any {
    this._vBundle = vBundle;
  }

  public setOtherPromises(
    loadPromise: any,
    bootstrapPromise: any,
    mountPromise: any,
    unmountPromise: any
  ) {
    this._loadPromise = promiseWithoutReturnValue(loadPromise);
    this._bootstrapPromise = promiseWithoutReturnValue(bootstrapPromise);
    this._mountPromise = promiseWithoutReturnValue(mountPromise);
    this._unmountPromise = promiseWithoutReturnValue(unmountPromise);
  }

  public unmount(): any {
    return promiseWithoutReturnValue(this._vBundle.unmountThisVBundle());
  }
  public getStatus(): any {
    return this._vBundle.status;
  }

  public update(props: any): any {
    console.log('vBundle props --- ', props);
    return this._updatePromise(props);
  }

  public loadPromise(): any {
    return promiseWithoutReturnValue(this._loadPromise);
  }
  public bootstrapPromise(): any {
    return promiseWithoutReturnValue(this._bootstrapPromise);
  }

  public mountPromise(): Promise<any> {
    return promiseWithoutReturnValue(this._mountPromise);
  }

  public unmountPromise(): any {
    return promiseWithoutReturnValue(this._unmountPromise);
  }
}

function promiseWithoutReturnValue(promise: Promise<any>): Promise<any> {
  return promise.then(() => null);
}

let vBundleCount = 0;
const rootMicroFes = { vBundles: {} };

export default function mountRootVBundle(...args: any) {
  const reValue = mountVApp.apply(rootMicroFes, args);
  console.log('re value', reValue);
  return reValue;
}

let owningMicroFe: any = rootMicroFes;

function mountVApp(config: any, customProps: any): any {
  console.log(config, customProps);
  const id = vBundleCount++;

  const passedConfigLoadingFunction = typeof config === 'function';
  const configLoadingFunction = passedConfigLoadingFunction
    ? config
    : () => Promise.resolve(config);

  //init vBundle object

  const vBundle: any = {
    id,
    vBundles: {},
    status: passedConfigLoadingFunction
      ? LOADING_SOURCE_CODE
      : NOT_BOOTSTRAPPED,
    customProps,
    // parentName: toName(owningMicroFe),
    unmountThisVBundle() {
      return _mountPromise
        .then(() => {
          if (vBundle.status !== MOUNTED) {
            throw Error(
              `Cannot unmount vBundle -- it is in a ${vBundle.status} status`
            );
          }
          return toUnmountPromise(vBundle, true);
        })
        .then((value: any) => {
          if (vBundle.parentName) {
            delete owningMicroFe.vBundles[vBundle.id];
          }

          return value;
        })
        .then((value: any) => {
          resolveUnmount(value);
          return value;
        })
        .catch((err: any) => {
          vBundle.status = SKIP_BECAUSE_BROKEN;
          rejectUnmount(err);
          throw err;
        });
    },
  };

  owningMicroFe.vBundles[id] = vBundle;

  let loadPromise = configLoadingFunction();

  if (!loadPromise || typeof loadPromise.then !== 'function') {
    throw Error(
      `When mounting a vBundle, the config loading function must return a promise that resolves with the vBundle config`
    );
  }

  const returnVapp = new VApp();

  loadPromise = loadPromise.then((config: any) => {
    if (!config) {
      throw Error(
        `When mounting a vBundle, the config loading function returned a promise that did not resolve with a vBundle config`
      );
    }
    const name = config.name || `vBundle-${id}`;

    // if (
    //   // ES Module objects don't have the object prototype
    //   Object.prototype.hasOwnProperty.call(config, "bootstrap") &&
    //   !validLifecycleFn(config.bootstrap)
    // ) {
    //   throw Error(
    //     formatErrorMessage(
    //       9,
    //       __DEV__ && `VBundle ${name} provided an invalid bootstrap function`,
    //       name
    //     )
    //   );
    // }

    // if (!validLifecycleFn(config.mount)) {
    //   throw Error(
    //     formatErrorMessage(
    //       10,
    //       __DEV__ && `VBundle ${name} must have a valid mount function`,
    //       name
    //     )
    //   );
    // }

    // if (!validLifecycleFn(config.unmount)) {
    //   throw Error(
    //     formatErrorMessage(
    //       11,
    //       __DEV__ && `VBundle ${name} must have a valid unmount function`,
    //       name
    //     )
    //   );
    // }

    // if (config.update && !validLifecycleFn(config.update)) {
    //   throw Error(
    //     formatErrorMessage(
    //       12,
    //       __DEV__ && `VBundle ${name} provided an invalid update function`,
    //       name
    //     )
    //   );
    // }

    const bootstrap = flattenFnArray(config, 'bootstrap');
    const mount = flattenFnArray(config, 'mount');
    const unmount = flattenFnArray(config, 'unmount');

    vBundle.status = NOT_BOOTSTRAPPED;
    vBundle.name = name;
    vBundle.bootstrap = bootstrap;
    vBundle.mount = mount;

    vBundle.unmount = unmount;
    vBundle.timeouts = globalTimeoutConfig;
    vBundle.customRoot = config.customRoot;

    if (config.update) {
      vBundle.update = flattenFnArray(config, 'update');
      returnVapp.setUpdatePromise();
    }
  });

  returnVapp.setVBundle(vBundle);

  const bootstrapPromise = loadPromise.then(() =>
    toBootstrapPromise(vBundle, true)
  );

  const _mountPromise = bootstrapPromise.then(() =>
    toMountPromise(vBundle, true)
  );

  let resolveUnmount: any, rejectUnmount: any;

  const unmountPromise = new Promise((resolve, reject) => {
    resolveUnmount = resolve;
    rejectUnmount = reject;
  });

  returnVapp.setOtherPromises(
    loadPromise,
    bootstrapPromise,
    _mountPromise,
    unmountPromise
  );

  return returnVapp;
}
