
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
    // 1. Call _update() on all dirty atoms.
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const [deps, atom] = ATOM_STACK[i];

        if (util.isNull(deps)) { // if a source atom.
            if (atom._dirty === true)
                atom._update();
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

    // 2. Set all atoms to not dirty.
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const [_, atom] = ATOM_STACK[i];
        atom._dirty = false;
    }
};

const SCHEDULE_ATOM_UPDATE = () => {
    if (!ATOM_UPDATE_SCHEDULED) {
        ATOM_UPDATE_SCHEDULED = true;

        setTimeout(() => {
            ATOM_UPDATE_SCHEDULED = false;
            UPDATE_ATOMS(); // side effects in callbacks will schedule another update.
        });
    }
};

const exports = {};

let ATOM_ID_COUNTER = 0;

/*
ARG_value should be the initial value or a derivation function if deps is not undefined or null.
deps must be undefined, null, or a non-empty Array.
if passDepsInArray is true, dependency values will be passed to derivation function in an array.
*/
exports.createAtom = function(ARG_value, deps, passDepsInArray) {
    if (util.isUdf(deps)) deps = null; // default value if caller does not pass argument.

    let _value;

    const atom = () => _value;
    atom._dirty = false;
    atom._id = ATOM_ID_COUNTER++;
    atom._type = 'atom';

    const _callbacks = [];
    const _callCallbacks = () => {
        for (let i = 0; i < _callbacks.length; i++)
            _callbacks[i](_value);
    };
    atom.listen = (newCallback) => {
        _callbacks.push(newCallback);
        return () => {
            util.removeItem(_callbacks, newCallback);
        };
    };

    let _onActive;

    if (util.isNull(deps)) { // if a source atom.
        _value = ARG_value;

        // update() is only defined on source atoms.
        atom.update = (newValue) => {
            _value = newValue;
            atom._dirty = true;
            SCHEDULE_ATOM_UPDATE();
        };

        atom._update = _callCallbacks;

        _onActive = util.noop;
    }
    else { // if a derived atom.
        // assert(typeof deps === non-empty array)
        // assert(typeof ARG_value === function)

        const _updateDerivedValue = () => {
            const depValues = Array(deps.length);
            for (let i = 0; i < deps.length; i++)
                depValues[i] = deps[i]();

            _value = passDepsInArray === true ?
                ARG_value(depValues) : ARG_value(...depValues);
        };

        atom._update = () => {
            _updateDerivedValue();
            atom._dirty = true;
            _callCallbacks();
        };

        _onActive = _updateDerivedValue;
    }

    let active = false;
    const _stackEntry = [deps, atom];

    atom._activate = () => {
        if (!active) {
            ATOM_STACK.push(_stackEntry);
            active = true;

            _onActive();
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
    const _propKeys = util.isNull(props) ? null : Object.keys(props);    

    let _domElement;
    let _parentVDomNode;
    let _anchor = null;

    // _mounted and _mountedDOM = both false, both true, false + true, but never true + false.
    let _mounted = false;
    let _mountedDOM = false;

    let _disposeCallbacks = [];

    const vDomNode = {
        create: () => {
            _domElement = document.createElement(tagName);

            if (!util.isNull(children)) {
                for (let i = 0; i < children.length; i++)
                    children[i].create();
            }
        },
        mount: (parentVDomNode, ARG_anchor, insertMountFlag) => {
            _parentVDomNode = parentVDomNode;
            const anchorChanged = ARG_anchor !== _anchor;

            if (insertMountFlag === true) {
                _anchor = ARG_anchor;
                const before = _parentVDomNode.getNodeAfter(vDomNode);
                _anchor.insertBefore(_domElement, before);
                _mountedDOM = true;
            }
            else if (!_mountedDOM || anchorChanged) {
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
                            _domElement.setAttribute(attrib, prop());
                            _disposeCallbacks.push(prop.listen((newValue) => {
                                _domElement.setAttribute(attrib, newValue);
                            }));
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
                        children[i].mount(vDomNode, _domElement);
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
        },
        getNodeAfter: (childVDomNode) => {
            const index = children.indexOf(childVDomNode);

            for (let i = index+1; i < children.length; i++) {
                const e = children[i].getFirstElement();
                if (!util.isNull(e)) return e;
            }
            return null;
        },
        getFirstElement: () => {
            return _domElement;
        }
    };
    
    vDomNode.type = 'element';

    return vDomNode;
};

exports.createText = function(ARG_text) {
    let _domTextNode;
    let _parentVDomNode;
    let _anchor;

    // _mounted and _mountedDOM behave same as in createElement().
    let _mounted = false;
    let _mountedDOM = false;

    let _dispose = null;

    const vDomNode = {
        create: () => {
            const value = ARG_text._type === 'atom' ? '' : ARG_text;
            _domTextNode = document.createTextNode(value);
        },
        mount: (parentVDomNode, ARG_anchor, insertMountFlag) => {
            if (!_mounted) {
                if (ARG_text._type === 'atom') {
                    _domTextNode.nodeValue = ARG_text();
                    _dispose = ARG_text.listen((newValue) => {
                        _domTextNode.nodeValue = newValue;
                    });
                }
                _mounted = true;
            }

            _parentVDomNode = parentVDomNode;
            const anchorChanged = ARG_anchor !== _anchor;

            if (insertMountFlag === true) {
                _anchor = ARG_anchor;
                _anchor.insertBefore(_domTextNode, _parentVDomNode.getNodeAfter(vDomNode));
                _mountedDOM = true;
            }
            else if (!_mountedDOM || anchorChanged) {
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
        },
        getFirstElement: () => _domTextNode
    };

    vDomNode.type = 'text';
    
    return vDomNode;
};

let CURRENT_INITIALIZING_COMPONENT = null;

exports.createComponent = function(initFunc, props) {
    if (util.isUdf(props)) props = null;
    
    let _parentVDomNode;

    const vDomNode = { _atoms: [], _onMountHooks: [], _onUnmountHooks: [] };

    CURRENT_INITIALIZING_COMPONENT = vDomNode;
    const _childVDomNode = initFunc(props);
    CURRENT_INITIALIZING_COMPONENT = null;

    vDomNode.create = () => {
        _childVDomNode.create();
    };

    vDomNode.mount = (parentVDomNode, anchor, insertMountFlag) => {
        for (let i = 0; i < vDomNode._atoms.length; i++)
            vDomNode._atoms[i]._activate();

        _parentVDomNode = parentVDomNode;
        _childVDomNode.mount(vDomNode, anchor, insertMountFlag);

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

    vDomNode.getNodeAfter = (childVDomNode) =>
        _parentVDomNode.getNodeAfter(vDomNode);

    vDomNode.getFirstElement = () =>
        _childVDomNode.getFirstElement();

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

exports.useAtom = function(ARG_value, deps, passDepsInArray) {
    const atom = exports.createAtom(ARG_value, deps, passDepsInArray);
    CURRENT_INITIALIZING_COMPONENT._atoms.push(atom);
    return atom;
};

exports.createFragment = function(children) {
    let _parentVDomNode;

    const vDomNode = {
        create: () => {
            for (let i = 0; i < children.length; i++)
                children[i].create();
        },
        mount: (parentVDomNode, anchor, insertMountFlag) => {
            _parentVDomNode = parentVDomNode;

            for (let i = 0; i < children.length; i++)
                children[i].mount(vDomNode, anchor, insertMountFlag);
        },
        unmount: (unmountDOMFlag) => {
            for (let i = 0; i < children.length; i++)
                children[i].unmount(unmountDOMFlag);
        },
        getNodeAfter: (childVDomNode) => {
            const index = children.indexOf(childVDomNode);

            for (let i = index+1; i < children.length; i++) {
                const e = children[i].getFirstElement();
                if (!util.isNull(e)) return e;
            }
            return _parentVDomNode.getNodeAfter(vDomNode);
        },
        getFirstElement: () => {
            for (let i = 0; i < children.length; i++) {
                const e = children[i].getFirstElement();
                if (!util.isNull(e)) return e;
            }
            return null;
        }
    };

    vDomNode.type = 'fragment';

    return vDomNode;
};

exports.createIf = function(ARG_conditions, children) {
    let _anchor;
    let _parentVDomNode;

    let _activeConditionIndex = -1;
    let _isCreated = Array(ARG_conditions.length).fill(false);

    let _atom = exports.createAtom(util.pass, ARG_conditions, true);
    let _dispose;

    const vDomNode = {};

    const _activateCondition = (newIndex, remountFlag, insertMountFlag) => {
        const prevIndex = _activeConditionIndex;
        const indexChanged = prevIndex !== newIndex;

        if (prevIndex !== -1 && indexChanged)
            children[prevIndex].unmount(true); // physically unmount

        if (newIndex !== -1 && (indexChanged || remountFlag)) {
            if (!_isCreated[newIndex]) {
                children[newIndex].create();
                _isCreated[newIndex] = true;
            }
            children[newIndex].mount(vDomNode, _anchor, insertMountFlag);
        }

        _activeConditionIndex = newIndex;
    };
 
    vDomNode.create = util.noop;

    vDomNode.mount = (parentVDomNode, ARG_anchor, insertMountFlag) => {
        // const anchorChanged = ARG_anchor !== _anchor;

        _anchor = ARG_anchor;
        _parentVDomNode = parentVDomNode;

        _atom._activate();
        _dispose = _atom.listen((conditions) => {
            _activateCondition(conditions.indexOf(true), false, true);
        });

        _activateCondition(_atom().indexOf(true), true, insertMountFlag);
    };

    vDomNode.unmount = (unmountDOMFlag) => {
        if (_activeConditionIndex !== -1)
            children[_activeConditionIndex].unmount(unmountDOMFlag);

        _dispose();
        _dispose = null;
        _atom._deactivate();

        _anchor = null;
    };

    vDomNode.getNodeAfter = (childVDomNode) =>
        _parentVDomNode.getNodeAfter(vDomNode);

    vDomNode.getFirstElement = () =>
        _activeConditionIndex === -1 ? null :
            children[_activeConditionIndex].getFirstElement();

    vDomNode.type = 'if';

    return vDomNode;
};

exports.createFor = function(component, atom) {
    let _anchor;
    let _parentVDomNode;

    let _atomIDs = Object.create(null);
    let _items = [];
    let _childVDomNodes = [];

    let _dispose;

    const reconcileElements = (newItems, insertMountFlag) => {
        const oldAtomIDs = _atomIDs;
        const oldItems = _items;
        const oldChildVDomNodes = _childVDomNodes;

        // Remove duplicates in newItems.
        const newAtomIDs = Object.create(null);
        const temp = [];
        for (let i = 0; i < newItems.length; i++) {
            const item = newItems[i];

            if (!util.isUdf(item) && !util.isNull(item) && !(item._id in newAtomIDs)) {
                newAtomIDs[item._id] = i;
                temp.push(item);
            }
        }
        newItems = temp;

        const newChildVDomNodes = Array(newItems.length);

        for (let i = 0; i < oldItems.length; i++) {
            const oldItem = oldItems[i];

            if (oldItem._id in newAtomIDs) {
                // Swap vDOM node.
                newChildVDomNodes[newAtomIDs[oldItem._id]] = oldChildVDomNodes[i];
            }
            else {
                // When item is removed, unmount old vDOM node.
                oldChildVDomNodes[i].unmount(true);
            }
        }

        // Create vDOM nodes for newly added items.
        for (let i = 0; i < newItems.length; i++) {
            const newItem = newItems[i];

            if (!(newItem._id in oldAtomIDs)) {
                const child = exports.createComponent(component, newItem);
                child.create();
                newChildVDomNodes[i] = child;
            }
        }

        _items = [...newItems];
        _atomIDs = newAtomIDs;
        _childVDomNodes = [];

        // Remount vDOM nodes for all existing and newly added items.
        for (let i = 0; i < newChildVDomNodes.length; i++) {
            _childVDomNodes.push(newChildVDomNodes[i]);
            _childVDomNodes[i].mount(vDomNode, _anchor, insertMountFlag);
        }
    };

    const vDomNode = {
        create: util.noop,
        mount: (parentVDomNode, ARG_anchor, insertMountFlag) => {
            _parentVDomNode = parentVDomNode;
            _anchor = ARG_anchor;

            atom._activate();
            _dispose = atom.listen((items) => {
                reconcileElements(items, true);
            });

            reconcileElements(atom(), insertMountFlag);
        },
        unmount: (unmountDOMFlag) => {
            for (let i = 0; i < _childVDomNodes.length; i++) {
                const child = _childVDomNodes[i];
                child.unmount(unmountDOMFlag);
            }

            _dispose();
            _dispose = null;
            atom._deactivate();

            _anchor = null;
        },
        getNodeAfter: (childVDomNode) => {
            const index = _childVDomNodes.indexOf(childVDomNode);

            for (let i = index+1; i < _childVDomNodes.length; i++) {
                const e = _childVDomNodes[i].getFirstElement();
                if (!util.isNull(e)) return e;
            }
            return _parentVDomNode.getNodeAfter(vDomNode);
        },
        getFirstElement: () => {
            for (let i = 0; i < _childVDomNodes.length; i++) {
                const e = _childVDomNodes[i].getFirstElement();
                if (!util.isNull(e)) return e;
            }
            return null;
        }
    };

    vDomNode.type = 'for';

    return vDomNode;
};

exports.createRoot = function(anchor) {
    let _rootVDomNode = null;

    const rootObject = {
        render: (target) => {
            if (util.isUdf(target)) target = null;

            if (!util.isNull(_rootVDomNode))
                _rootVDomNode.unmount(true); // physically unmount
            _rootVDomNode = target;

            if (!util.isNull(_rootVDomNode)) {
                _rootVDomNode.create();
                _rootVDomNode.mount(rootObject, anchor);
            }
        },
        getNodeAfter: (childVDomNode) => null
    };

    return rootObject;
};

return exports;
}());

