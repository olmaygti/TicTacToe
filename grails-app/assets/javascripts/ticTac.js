(function () {
    "use strict";
    angular.module('ticTacApp', ['ui.router', 'ticTacApp.models']).
        controller('MainCtrl', [
            '$scope',
            'Player',
            'Board',
            function ($scope, Player, Board) {
            var ctx, board;

            function init () {
                $scope.ctx = ctx = {};
            }

            function nextPlayer() {
                return ctx.currentPlayer === ctx.players[0]
                    ? ctx.players[1]
                    : ctx.players[0];
            }

            $scope.move = function (cell) {

                console.log((ctx.currentPlayer.name) + ' moved to ' + cell);

                console.log('Next player is: ', nextPlayer());
            }

            $scope.startGame = function () {
                ctx.board = board = new Board();
                board.initBoard();
                ctx.players = [
                    new Player({
                        human: true,
                        style: 'circle',
                        name: 'David'
                    }),
                    new Player({
                        human: true,
                        style: 'cross',
                        name: 'Daniel'
                    })
                ];
                ctx.currentPlayer = ctx.players[0];
            }
            init();
        }]);
})();