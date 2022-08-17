
const fm = (function(){
const util = {
    noop: () => {},
    pass: (a) => a,
    isUdf: (a) => typeof a === 'undefined',
    isNull: (a) => a === null,
    removeItem: (a, item) => {
        let i = a.indexOf(item);
        if (i < 0 || i >= a.length) return;

        const stop = a.length - 1;
        while (i < stop) {
            a[i] = a[++i];
        }
        a.pop();
    }
};

let ATOM_UPDATE_SCHEDULED = false;
const ATOM_STACK = [];

const UPDATE_ATOMS = () => {
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const deps = ATOM_STACK[i][0];
        const atom = ATOM_STACK[i][1];

        if (util.isNull(deps)) { // if a source atom.
            if (atom._dirty === true) {
                atom._update();
            }
        }
        else { // if a derived atom.
            for (let i = 0; i < deps.length; i++) {
                if (deps[i]._dirty === true) {
                    atom._update();
                    break;
                }
            }
        }
    }

    for (let i = 0; i < ATOM_STACK.length; i++) {
        const atom = ATOM_STACK[i][1];
        atom._dirty = false;
    }
};

const SCHEDULE_ATOM_UPDATE = () => {
    if (ATOM_UPDATE_SCHEDULED) return;
    ATOM_UPDATE_SCHEDULED = true;

    setTimeout(() => {
        ATOM_UPDATE_SCHEDULED = false; // this should be before update so that a
                                       // side effect during update schedules another update.
        UPDATE_ATOMS();
    });
};

const exports = {};

/*
deps must be undefined, null, or an Array.
if passCallbackArgsAsArray === true, dep values will be passed to derivation function in an array.
*/
exports.createAtom = function(ARG_value, deps, passCallbackArgsAsArray) {
    if (util.isUdf(deps)) deps = null;

    let atom;

    let _value;
    const _callbacks = [];
    const _callCallbacks = () => {
        for (let i = 0; i < _callbacks.length; i++)
            _callbacks[i](_value);
    };

    if (util.isNull(deps)) { // if a source atom.
        _value = ARG_value;
        atom = () => _value;

        // atom.update is only defined on source atoms.
        atom.update = (newValue) => {
            _value = newValue;
            atom._dirty = true;
            SCHEDULE_ATOM_UPDATE();
        };

        atom._update = _callCallbacks; // gets called during next update.
    }
    else { // if a derived atom.
        // assert(deps === non-empty array)
        // assert(ARG_value === function)

        const _updateDerivedValue = () => {
            const depVals = [];
            for (let i = 0; i < deps.length; i++)
                depVals.push(deps[i]());

            _value = passCallbackArgsAsArray === true ?
                ARG_value(depVals) : ARG_value(...depVals);
        };

        _updateDerivedValue();

        const _update = () => {
            _updateDerivedValue();
            atom._dirty = true;
            _callCallbacks();
        };

        atom = () => {
            _update();
            return _value;
        };

        atom._update = _update;
    }

    atom._type = 'atom';
    atom._dirty = false;
    atom.listen = (newCallback) => {
        _callbacks.push(newCallback);
        return () => {
            util.removeItem(_callbacks, newCallback);
        };
    };

    let active = false;
    const _stackEntry = [deps, atom];

    atom._activate = () => {
        if (!active) {
            ATOM_STACK.push(_stackEntry);
            active = true;
        }
    };

    atom._deactivate = () => {
        if (active) {
            util.removeItem(ATOM_STACK, _stackEntry);
            active = false;
        }
    };

    atom._activate();

    return atom;
};

const startsWith_on = (s) => s[0] === 'o' && s[1] === 'n';

exports.createElement = function(tagName, props, children) {
    let _domElement;
    let _anchor;

    // _mounted and _mountedDOM
    //     can both be false,
    //     can both be true,
    //     _mounted false but _mountedDOM true, (for efficiency to not unmount DOM)
    //     but never _mounted true but _mountedDOM false.
    let _mounted = false;
    let _mountedDOM = false;

    const _propKeys = util.isNull(props) ? null : Object.keys(props);

    let _disposeCallbacks = [];

    const vDomNode = {
        create: () => {
            _domElement = document.createElement(tagName);

            if (!util.isNull(props)) {
                for (let i = 0; i < _propKeys.length; i++) {
                    const attrib = _propKeys[i];
                    const prop = props[attrib];

                    if (prop._type === 'atom') { // if a dynamic attribute.
                        _domElement.setAttribute(attrib, prop());
                    }
                    else if (startsWith_on(attrib)) { // if an event listener attribute.
                        const type = attrib.slice(2).toLowerCase();
                        _domElement.addEventListener(type, prop);
                    }
                    else { // if a static attribute.
                        _domElement.setAttribute(attrib, prop);
                    }
                }
            }

            if (!util.isNull(children)) {
                for (let i = 0; i < children.length; i++)
                    children[i].create();
            }
        },
        mount: (ARG_anchor) => {
            const anchorChanged = !ARG_anchor.isEqualNode(_anchor);
            // console.log('anchorChanged:', anchorChanged, _anchor, ARG_anchor);
            if (!_mountedDOM || anchorChanged) {
                _anchor = ARG_anchor;
                _anchor.appendChild(_domElement);
                _mountedDOM = true;
            }

            if (!_mounted) {
                if (!util.isNull(props)) {
                    for (let i = 0; i < _propKeys.length; i++) {
                        const attrib = _propKeys[i];
                        const prop = props[attrib];

                        if (prop._type === 'atom') { // if a dynamic attribute.
                            _disposeCallbacks.push(prop.listen((newValue) => {
                                _domElement.setAttribute(attrib, newValue);
                            }));
                        }
                    }
                }

                if (!util.isNull(children)) {
                    for (let i = 0; i < children.length; i++)
                        children[i].mount(_domElement);
                }

                _mounted = true;
            }
        },
        unmount: (unmountDOMFlag) => {
            if (_mounted) {
                if (!util.isNull(children)) {
                    for (let i = 0; i < children.length; i++)
                        children[i].unmount();
                }

                for (let i = 0; i < _disposeCallbacks.length; i++)
                    _disposeCallbacks[i]();
                _disposeCallbacks = [];

                _mounted = false;
            }

            if (_mountedDOM && unmountDOMFlag) {
                _anchor.removeChild(_domElement);
                _mountedDOM = false;
            }
        }
    };
    
    vDomNode.type = 'element';

    return vDomNode;
};

exports.createText = function(ARG_text) {
    let _domTextNode;
    let _anchor;

    // _mounted and _mountedDOM behave same as in createElement().
    let _mounted = false;
    let _mountedDOM = false;

    let _dispose = null;

    const vDomNode = {
        create: () => {
            const value = ARG_text._type === 'atom' ? ARG_text() : ARG_text;
            _domTextNode = document.createTextNode(value);
        },
        mount: (ARG_anchor) => {
            if (!_mounted) {
                if (ARG_text._type === 'atom') {
                    _dispose = ARG_text.listen((newValue) => {
                        _domTextNode.nodeValue = newValue;
                    });
                }
                _mounted = true;
            }

            const anchorChanged = !ARG_anchor.isEqualNode(_anchor);
            // console.log('anchorChanged:', anchorChanged, _anchor, ARG_anchor);
            if (!_mountedDOM || anchorChanged) {
                _anchor = ARG_anchor;
                _anchor.appendChild(_domTextNode);
                _mountedDOM = true;
            }
        },
        unmount: (unmountDOMFlag) => {
            if (_mountedDOM && unmountDOMFlag) {
                _anchor.removeChild(_domTextNode);
                _mountedDOM = false;
            }

            if (_mounted) {
                if (!util.isNull(_dispose)) {
                    _dispose();
                    _dispose = null;
                }
                _mounted = false;
            }
        }
    };

    vDomNode.type = 'text';
    
    return vDomNode;
};

let CURRENT_INITIALIZING_COMPONENT = null;

exports.createComponent = function(initFunc) {
    const vDomNode = { _atoms: [], _onMountHooks: [], _onUnmountHooks: [] };

    CURRENT_INITIALIZING_COMPONENT = vDomNode;
    const _childVDomNode = initFunc();
    CURRENT_INITIALIZING_COMPONENT = null;

    vDomNode.create = () => {
        _childVDomNode.create();
    };

    vDomNode.mount = (anchor) => {
        for (let i = 0; i < vDomNode._atoms.length; i++)
            vDomNode._atoms[i]._activate();

        _childVDomNode.mount(anchor);

        for (let i = 0; i < vDomNode._onMountHooks.length; i++)
            vDomNode._onMountHooks[i]();
    };

    vDomNode.unmount = (unmountDOMFlag) => {
        for (let i = 0; i < vDomNode._onUnmountHooks.length; i++)
            vDomNode._onUnmountHooks[i]();

        _childVDomNode.unmount(unmountDOMFlag);

        for (let i = 0; i < vDomNode._atoms.length; i++)
            vDomNode._atoms[i]._deactivate();
    };

    vDomNode.type = 'component';

    return vDomNode;
};

// onMount hooks gets called after mounting.
exports.onMount = function(hook) {
    CURRENT_INITIALIZING_COMPONENT._onMountHooks.push(hook);
};

// onUnmount hooks gets called before unmounting.
exports.onUnmount = function(hook) {
    CURRENT_INITIALIZING_COMPONENT._onUnmountHooks.push(hook);
};

exports.useAtom = function(ARG_value, deps, passCallbackArgsAsArray) {
    const atom = exports.createAtom(ARG_value, deps, passCallbackArgsAsArray);
    CURRENT_INITIALIZING_COMPONENT._atoms.push(atom);
    return atom;
};

exports.createFragment = function(children) {
    const vDomNode = {
        create: () => {
            for (let i = 0; i < children.length; i++)
                children[i].create();
        },
        mount: (anchor) => {
            for (let i = 0; i < children.length; i++)
                children[i].mount(anchor);
        },
        unmount: (unmountDOMFlag) => {
            for (let i = 0; i < children.length; i++)
                children[i].unmount(unmountDOMFlag);
        }
    };

    vDomNode.type = 'fragment';

    return vDomNode;
};

exports.createIf = function(ARG_conditions, children) {
    let _anchor;

    let _activeConditionIndex = -1;
    let _isCreated = Array(ARG_conditions.length).fill(false);

    let _atom = exports.createAtom(util.pass, ARG_conditions, true);
    let _dispose;

    const _activateCondition = (newIndex, remountFlag) => {
        const prevIndex = _activeConditionIndex;
        const indexChanged = prevIndex !== newIndex;

        if (prevIndex !== -1 && indexChanged) {
            children[prevIndex].unmount(true); // physically unmount
        }

        if (newIndex !== -1 && (indexChanged || remountFlag)) {
            if (!_isCreated[newIndex]) {
                children[newIndex].create();
                _isCreated[newIndex] = true;
            }
            children[newIndex].mount(_anchor);
        }

        _activeConditionIndex = newIndex;
    };
 
    const vDomNode = {
        create: util.noop,
        mount: (ARG_anchor) => {
            _anchor = ARG_anchor;

            _atom._activate();
            _dispose = _atom.listen((conditions) => {
                _activateCondition(conditions.indexOf(true), false);
            });

            _activateCondition(_atom().indexOf(true), true);
        },
        unmount: (unmountDOMFlag) => {
            if (_activeConditionIndex !== -1) {
                children[_activeConditionIndex].unmount(unmountDOMFlag);
            }

            _dispose();
            _dispose = null;
            _atom._deactivate();

            _anchor = null;
        }
    };

    vDomNode.type = 'if'

    return vDomNode;
};

exports.createRoot = function(anchor) {
    let _rootVDomNode = null;

    return {
        render: (target) => {
            if (util.isUdf(target)) target = null;

            if (!util.isNull(_rootVDomNode)) {
                _rootVDomNode.unmount(true); // physically unmount
            }
            _rootVDomNode = target;

            if (!util.isNull(_rootVDomNode)) {
                _rootVDomNode.create();
                _rootVDomNode.mount(anchor);
            }
        }
    };
};

return exports;
}());

