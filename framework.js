
const fm = (function(){
const util = {
    noop: function(){},
    isUdf: (a) => typeof a === 'undefined',
    isNull: (a) => a === null,
    isFunction: (a) => typeof a === 'function',
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
            if (atom._dirty) {
                atom._update();
            }
        }
        else { // if a derived atom.
            for (let i = 0; i < deps.length; i++) {
                if (deps[i]._dirty) {
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

exports.createAtom = function(ARG_value, deps) {
    let _value;

    const _callbacks = [];
    const _callCallbacks = () => {
        for (let i = 0; i < _callbacks.length; i++) {
            _callbacks[i](_value);
        }
    };

    const atom = () => _value;
    atom._type = 'atom';
    atom._dirty = false;
    atom.listen = (newCallback) => {
        _callbacks.push(newCallback);
        return () => {
            util.removeItem(_callbacks, newCallback);
        };
    };

    if (util.isUdf(deps)) deps = null;
    if (util.isNull(deps)) { // if a source atom.
        _value = ARG_value;

        atom.update = (newValue) => {
            _value = newValue;
            atom._dirty = true;
            SCHEDULE_ATOM_UPDATE();
        };

        atom._update = _callCallbacks; // gets called during next update.
    }
    else { // if a derived atom.
        // deps should be a non-empty array and
        // ARG_value should be a function.

        const _updateDerivedValues = () => {
            const values = [];
            for (let i = 0; i < deps.length; i++) {
                values.push(deps[i]());
            }
            _value = ARG_value(...values);
        };

        _updateDerivedValues();

        atom._update = () => {
            _updateDerivedValues();
            atom._dirty = true;
            _callCallbacks(); // gets called immediately.
        };
    }

    const _stackEntry = [deps, atom];

    let active = false;

    atom.activate = () => {
        if (!active) {
            ATOM_STACK.push(_stackEntry);
            active = true;
        }
    };

    atom.deactivate = () => {
        util.removeItem(ATOM_STACK, _stackEntry);
        active = false;
    };

    atom.activate();

    return atom;
};

const startsWith_on = (s) => s[0] === 'o' && s[1] === 'n';

exports.createElement = function(tagName, props, children) {
    let _domElement;
    let _anchor;

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
                        _domElement.setAttribute(attrib, prop);
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
                for (let i = 0; i < children.length; i++) {
                    children[i].create();
                }
            }
        },
        mount: (ARG_anchor) => {
            _anchor = ARG_anchor;
            _anchor.appendChild(_domElement);

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
                for (let i = 0; i < children.length; i++) {
                    children[i].mount(_domElement);
                }
            }
        },
        unmount: () => {
            if (!util.isNull(children)) {
                for (let i = 0; i < children.length; i++) {
                    children[i].unmount();
                }
            }

            for (let i = 0; i < _disposeCallbacks.length; i++) {
                _disposeCallbacks[i]();
            }
            _disposeCallbacks = [];

            _anchor.removeChild(_domElement);
            _anchor = null;
        }
    };
    
    vDomNode.type = 'element';

    return vDomNode;
};

exports.createText = function(ARG_text) {
    let _domTextNode;
    let _anchor;

    let _dispose = null;

    const vDomNode = {
        create: () => {
            const value = ARG_text._type === 'atom' ? ARG_text() : ARG_text;
            _domTextNode = document.createTextNode(value);
        },
        mount: (ARG_anchor) => {
            _anchor = ARG_anchor;

            if (ARG_text._type === 'atom') {
                _dispose = ARG_text.listen((newValue) => {
                    _domTextNode.nodeValue = newValue;
                });
            }

            _anchor.appendChild(_domTextNode);
        },
        unmount: () => {
            _anchor.removeChild(_domTextNode);
            _anchor = null;

            if (!util.isNull(_dispose)) {
                _dispose();
                _dispose = null;
            }
        }
    };

    vDomNode.type = 'text';
    
    return vDomNode;
};

let CURRENT_INITIALIZING_COMPONENT = null;

exports.createComponent = function(initFunc) {
    const vDomNode = { _onMountHook: null, _onUnmountHook: null, _atoms: [] };

    CURRENT_INITIALIZING_COMPONENT = vDomNode;
    const _childVDomNode = initFunc();
    CURRENT_INITIALIZING_COMPONENT = null;

    vDomNode.create = () => {
        _childVDomNode.create();
    };

    vDomNode.mount = (anchor) => {
        for (let i = 0; i < vDomNode._atoms.length; i++) {
            vDomNode._atoms[i].activate();
        }

        _childVDomNode.mount(anchor);

        if (!util.isNull(vDomNode._onMountHook))
            vDomNode._onMountHook();
    };

    vDomNode.unmount = () => {
        if (!util.isNull(vDomNode._onUnmountHook))
            vDomNode._onUnmountHook();

        _childVDomNode.unmount();

        for (let i = 0; i < vDomNode._atoms.length; i++) {
            vDomNode._atoms[i].deactivate();
        }
    };

    vDomNode.type = 'component';

    return vDomNode;
};

exports.onMount = function(hook) { // gets called after mounting.
    CURRENT_INITIALIZING_COMPONENT._onMountHook = hook;
};

exports.onUnmount = function(hook) { // gets called before unmounting.
    CURRENT_INITIALIZING_COMPONENT._onUnmountHook = hook;
};

exports.useAtom = function(ARG_value, deps) {
    const atom = exports.createAtom(ARG_value, deps);
    CURRENT_INITIALIZING_COMPONENT._atoms.push(atom);
    return atom;
};

exports.createFragment = function(children) {
    const vDomNode = {
        create: () => {
            for (let i = 0; i < children.length; i++) {
                children[i].create();
            }
        },
        mount: (anchor) => {
            for (let i = 0; i < children.length; i++) {
                children[i].mount(anchor);
            }
        },
        unmount: () => {
            for (let i = 0; i < children.length; i++) {
                children[i].unmount();
            }
        }
    };

    vDomNode.type = 'fragment';

    return vDomNode;
};

exports.createIf = function(conditions, children) {
    if (conditions.length <= 0 || conditions.length !== children.length) return null;

    let _anchor;

    let _cachedConditions;
    let _activeConditionIndex;
    let _isCreated = Array(conditions.length).fill(false);

    let _disposeCallbacks = [];

    const _activateIndex = () => {
        if (_activeConditionIndex !== -1) {
            if (!_isCreated[_activeConditionIndex]) {
                children[_activeConditionIndex].create();
                _isCreated[_activeConditionIndex] = true;
            }

            children[_activeConditionIndex].mount(_anchor);
        }
    };

    const vDomNode = {
        create: util.noop,
        mount: (ARG_anchor) => {
            _anchor = ARG_anchor;

            for (let i = 0; i < conditions.length; i++) {
                const condition = conditions[i];
                if (condition._type !== 'atom') continue;

                _disposeCallbacks.push(condition.listen((newValue) => {
                    _cachedConditions[i] = newValue;
                    newActiveConditionIndex = _cachedConditions.indexOf(true);

                    if (_activeConditionIndex !== newActiveConditionIndex) {
                        if (_activeConditionIndex !== -1) {
                            children[_activeConditionIndex].unmount();
                        }

                        _activeConditionIndex = newActiveConditionIndex;
                        _activateIndex();
                    }
                }));
            }

            _cachedConditions = Array(conditions.length);
            for (let i = 0; i < conditions.length; i++) {
                const c = conditions[i];
                _cachedConditions[i] = c._type === 'atom' ? c() : c;
            }
            _activeConditionIndex = _cachedConditions.indexOf(true);
            _activateIndex();
        },
        unmount: () => {
            if (_activeConditionIndex !== -1) {
                children[_activeConditionIndex].unmount();
            }
            _cachedConditions = null;
            _activeConditionIndex = -1;

            for (let i = 0; i < _disposeCallbacks.length; i++) {
                _disposeCallbacks[i]();
            }
            _disposeCallbacks = [];

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
            if (!util.isNull(_rootVDomNode)) {
                _rootVDomNode.unmount();
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

