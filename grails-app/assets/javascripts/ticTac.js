(function () {
    "use strict";
    angular.module('ticTacApp', ['ui.router']).
        controller('MainCtrl', ['$scope', function ($scope) {
            var ctx;

            console.log('controller wired');

            function init () {
                $scope.ctx = ctx = {};
            }

            $scope.startGame = function () {
                ctx.message = 'Starting new game, under construction';
            }
            init();
        }]);
})();