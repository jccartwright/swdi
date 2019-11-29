// define ([
//     'dojo/_base/declare'
// ],
// function (
//     declare
// ) {
//     return declare([], {
//         name: 'jcc',

//         getName: function() {
//             return this.name;
//         }
//     });
// });
define(function(){
    var name = 'jcc';
    return {
        getName: function() {
            return name;
        }
    };
});