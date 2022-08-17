
const firstIfCondition = fm.createAtom(false);
const secondIfCondition = fm.createAtom(false);

const MyComponent = () => {
    fm.onMount(() => {
        console.log('MyComponent is mounting.');
    });

    fm.onUnmount(() => {
        console.log('MyComponent is unmounting.');
    });

    fm.onUnmount(() => {
        console.log('Second onUnmount Hook.');
    })

    fm.onMount(() => {
        console.log('Second onMount Hook.');
    })

    const buttonText = fm.useAtom('Hello World!');
    const derivedButtonText = fm.useAtom((a) => a + ' Some Extra Text.', [buttonText]);

    const onClick = (e) => {
        console.log('Hello World!');
        buttonText.update('Updated!');
        firstIfCondition.update(!firstIfCondition());
    };

    return (
        fm.createFragment([
            fm.createElement('div', {id: 'element-A'}, [
                fm.createElement('button', {id: buttonText, onClick: onClick}, [
                    fm.createText(derivedButtonText),
                    fm.createElement('br', null, null),
                    fm.createText('another line of text')
                ])
            ]),
            fm.createElement('div', null, [
                fm.createText('Another Div Element.')
            ]),
            fm.createIf([firstIfCondition, secondIfCondition, fm.createAtom(true)], [
                fm.createElement('div', null, [
                    fm.createText('First if condition is true.')
                ]),
                fm.createElement('div', null, [
                    fm.createText('Second if condition is true.')
                ]),
                fm.createElement('div', null, [
                    fm.createText('Else is true.')
                ])
            ])
        ])
    );
};

const rootVDomNode = fm.createComponent(MyComponent);

const root = fm.createRoot(document.getElementById('root'));
root.render(rootVDomNode);

setTimeout(function(){
    const firstOnClick = () => {
        console.log('Clicked Button 1.');
        firstIfCondition.update(!firstIfCondition());
    };

    const secondOnClick = () => {
        console.log('Clicked Button 2.');
        secondIfCondition.update(!secondIfCondition());
    };

    root.render(
        fm.createFragment([
            fm.createElement('div', {id: 'element-B'}, [
                fm.createText('New Div Element!')
            ]),
            fm.createElement('div', null, [
                fm.createText('Second Div Element.')
            ]),
            fm.createElement('button', {onClick: firstOnClick}, [
                fm.createText('Toggle First If Condition.')
            ]),
            fm.createElement('button', {onClick: secondOnClick}, [
                fm.createText('Toggle Second If Condition.')
            ])
        ])
    );
}, 3000);

setTimeout(function(){
    root.render(fm.createElement('div', {id: 'new-parent-element'}, [
        rootVDomNode
    ]));
}, 5000);

