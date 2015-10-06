(function () {
    "use strict";
    angular.module('ticTacApp', ['ui.router', 'ticTacApp.models']).
        controller('MainCtrl', [
            '$scope',
            'Player',
            'Board',
            function ($scope, Player, Board) {
            var ctx;

            console.log('controller wired');

            function init () {
                $scope.ctx = ctx = {};
            }

            $scope.startGame = function () {
                ctx.message = 'Starting new game, under construction';
                ctx.board = new Board();
            }
            init();
        }]);
})();