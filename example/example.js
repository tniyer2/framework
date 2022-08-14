
const buttonText = fm.atom('Hello World!');

const MyComponent = fm.component(() => {
    fm.onMount(() => {
        console.log('My component is mounting.');
    });

    fm.onUnmount(() => {
        console.log('My component is unmounting.');
    });

    const onClick = (e) => {
        console.log('Hello World!');
        buttonText.update('button clicked');
    };

    const buttonText2 = fm.useAtom((a) => a + ' Some Extra Text.', [buttonText]);

    return (
        fm.createFragment([
            fm.createElement('div', {id: 'element-A'}, [
                fm.createElement('button', {id: buttonText, onClick}, [
                    fm.createText(buttonText2),
                    fm.createElement('br', null, null),
                    fm.createText('another line of text')
                ])
            ]),
            fm.createElement('div', null, [
                fm.createText('Another Div Element.')
            ])
        ])
    );
});

const root = fm.createRoot(document.getElementById('root'));
root.render(MyComponent);

setTimeout(function(){
    root.render(
        fm.createFragment([
            fm.createElement('div', {id: 'element-B'}, [
                fm.createText('New Div Element!')
            ]),
            fm.createElement('div', null, [
                fm.createText('Another Div Element.')
            ])
        ])
    );
}, 3000);

setTimeout(function(){
    root.render(MyComponent);
}, 5000);

