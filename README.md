From the moment that the interview was finished until I managed to make the remote feature work I made only a few changes, the more important ones:

* Add a `syncFinished` flag on the message from the first remote peer that finished config (he has one local player and one remote). That way the other is able to switch the order of players (local was at ctx.players[0] and now is moved to ctx.players[1]), and knows that the turn if from the OTHER remote player. Also that helps in the small hack of changing styles for not having two players using circles.

* Store an specific reference to ctx.localUser, this is only to make easier comparison in the controller and in the html template.

That was pretty much it, I was quite close on time!!. If I knew beforehand I wouldn't have used a grails backend (that is not used at all except for static serving files) which took me around half an hour to set up. The simple ruby server of te DIY cartdridge from Openshift would have just been enough to start coding javascript ;)


I haven't done any controller errors at all, so please respect your turns while playing, keep and eye on the "waiting" message before making any move. And don't register two players with the same name!!! :P
