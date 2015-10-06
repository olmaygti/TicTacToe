(function () {
    "use strict";
    angular.module('ticTacApp', ['ui.router', 'ticTacApp.models']).
        controller('MainCtrl', [
            '$scope',
            'Player',
            'Board',
            function ($scope, Player, Board) {
            var ctx, board;

            console.log('controller wired');

            function init () {
                $scope.ctx = ctx = {};
            }

            $scope.startGame = function () {
                ctx.board = board = new Board();
                board.initBoard();
            }
            init();
        }]);
})();