function s00012ak_onActionTag( this, avoid, code )
  if( code == 100 ) then
    -- configure via XSL
    local url = this.gamePiece:pieceUrl( "view", "flickrsign_edit.xsl" )
    this.gameKit:openBrowser( url )
  end
  if( code == 101 ) then
    -- report it as offensive via XSL
    local url = this.gamePiece:pieceUrl( "view", "flickrsign_report.xsl" )
    this.gameKit:openBrowser( url )
  end
  if( code == 102 ) then
    -- open the flickr home page for this photoId
    local textPhotoId = this.gamePiece:property( "photoId", GamePiecePropertyNull ) or ""
    local url = "https://flickr.com/photo.gne?id=".. textPhotoId
    if ( textPhotoId  == "" ) then
      url = "https://flickr.com"
    end
    this.gameKit:openBrowser( url )
  end
  if( ( code >= 120 ) and ( code <= 122 ) ) then
    this.gamePiece:sendServerPacket( code, 0, 0, 0, 0, 0, 0, 0, 0 )
  end
end

-- Examine a possible-user-entered-string and validate it is a real flickr
-- url.  Feel free to try to compose one from what you DID get
-- http://farm2.static.flickr.com/1337/1377322666_469699129b_m.jpg
-- note that flickr now suppresses the dot and shows "staticflickr" instead of "static.flickr" so please auto-repair that
-- note that flickr now gives https as the protocol, but we must actually use http
-- note that new flickr images use the format:
-- https://c3.staticflickr.com/3/2793/4341827881_ddb8814afd.jpg

gls00012ak_args = {}

function s00012ak__parseFlickrUrl( this, rawUrl )
  local photoId = "hello"
  -- extract the individual elements
  -- if the expected elements are found, we're golden

  -- "%1 %2 %3 %4 %5 " 

  gls00012ak_args = {}

  local result, num = gsub( rawUrl, 
                            "^https?://farm(%d+)\.static\.flickr\.com/(%d+)/([%d%l%u]+)_([%d%l%u]+)(.+)", 
                            function( farm, server, phId, secId, extension )
                              gls00012ak_args[ "textFarm"]      = tostring( farm      or 0 )
                              gls00012ak_args[ "textServer"]    = tostring( server    or 0 )
                              gls00012ak_args[ "textPhotoId"]   = tostring( phId      or 0 )
                              gls00012ak_args[ "textSecId"]     = tostring( secId     or 0 )
                              gls00012ak_args[ "textExtension"] = tostring( extension or 0 )
                              
                              return "" 
                            end 
                           )

  if( num < 1 ) then
    -- try again without the dot
    this.gameKit:logMessage(4, "parseFlickr failed, trying again with staticFlickr, no dot")

    result, num = gsub( rawUrl, 
                            "^https?://farm(%d+)\.staticflickr\.com/(%d+)/([%d%l%u]+)_([%d%l%u]+)(.+)", 
                            function( farm, server, phId, secId, extension )
                              gls00012ak_args[ "textFarm"]      = tostring( farm      or 0 )
                              gls00012ak_args[ "textServer"]    = tostring( server    or 0 )
                              gls00012ak_args[ "textPhotoId"]   = tostring( phId      or 0 )
                              gls00012ak_args[ "textSecId"]     = tostring( secId     or 0 )
                              gls00012ak_args[ "textExtension"] = tostring( extension or 0 )
                              
                              return "" 
                            end 
                           )
  end
  
  -- if it is a farm, this is its number
  local textFarm      = gls00012ak_args[ "textFarm"]       or "0"

  -- and this is what we'll need in the url
  local domainWord = ".static.flickr.com/"
  local farmWord = "farm" .. textFarm

  if( num < 1 ) then
      -- Not a farm try again, looking for new C format (sticks farm number as extra slash value)
      -- https://c3.staticflickr.com/3/2793/4341827881_ddb8814afd.jpg
      this.gameKit:logMessage(4, "parseFlickr failed, trying again with new C format")
  

     result, num = gsub( rawUrl, 
                              "^https?://c(%d+)\.staticflickr\.com/(%d+)/(%d+)/([%d%l%u]+)_([%d%l%u]+)(.+)", 
                              function( c, farm, server, phId, secId, extension )
                                gls00012ak_args[ "textC"]         = tostring( c      or 0 )
                                gls00012ak_args[ "textFarm"]      = tostring( farm      or 0 )
                                gls00012ak_args[ "textServer"]    = tostring( server    or 0 )
                                gls00012ak_args[ "textPhotoId"]   = tostring( phId      or 0 )
                                gls00012ak_args[ "textSecId"]     = tostring( secId     or 0 )
                                gls00012ak_args[ "textExtension"] = tostring( extension or 0 )
                                
                                return "" 
                              end 
                             )
     if( num > 0 ) then
       local textC      = gls00012ak_args[ "textC"]       or "0"
       farmWord = "c" .. textC
     end
  end

  
  if( num < 1 ) then
      -- But it's NOT a farm or a C, try again, looking for new live format (no farm number at all)
      -- https://live.staticflickr.com/434/31753227774_4c1179efeb_b.jpg
      -- https://live.staticflickr.com/434/31753227774_4c1179efeb_b.jpg
      this.gameKit:logMessage(4, "parseFlickr failed, trying again with new live format")

  
      result, num = gsub( rawUrl, 
                              "^https?://live\.staticflickr\.com/(%d+)/([%d%l%u]+)_([%d%l%u]+)(.+)", 
                              function( server, phId, secId, extension )
                                gls00012ak_args[ "textServer"]    = tostring( server    or 0 )
                                gls00012ak_args[ "textPhotoId"]   = tostring( phId      or 0 )
                                gls00012ak_args[ "textSecId"]     = tostring( secId     or 0 )
                                gls00012ak_args[ "textExtension"] = tostring( extension or 0 )
                                
                                return "" 
                              end 
                             )
      farmWord = "live"
      domainWord = ".staticflickr.com/"
  end

  local textServer    = gls00012ak_args[ "textServer"]     or "0"
  local textPhotoId   = gls00012ak_args[ "textPhotoId"]    or "0"
  local textSecId     = gls00012ak_args[ "textSecId"]      or "0"
  local textExtension = gls00012ak_args[ "textExtension"]  or "0"

  this.gameKit:logMessage( 4, "parseFlickr " .. rawUrl 
                           .. " num: " .. num
                           .. " result: " .. result
                           .. " farm " .. textFarm
                           .. " server " .. textServer
                           .. " photoId " .. textPhotoId
                           .. " secId " .. textSecId
                           .. " extension " .. textExtension 
                         )

  
  if( num > 0 ) then
    local resultUrl = "https://" .. farmWord
                      ..domainWord .. textServer
                      .."/" .. textPhotoId
                      .."_" .. textSecId 
   --                 .."_m.jpg"  -- 256
                      ..".jpg"  -- 512

    this.gameKit:logMessage( 4, "parseFlickr resultUrl: " .. resultUrl )
    return resultUrl, textPhotoId
  end

  -- failure, do something appropriate
  return nil, nil
end

-- For example, an XSL configuration page has just been submitted.
-- Evaluate the query arguments, do nothing if the request is illegal,
-- or set properties (which will go to oidprops, and then to objects
-- subscribed to those oidprops

function s00012ak_onQueuedQuery( this, query )
  local avoid = tonumber( query.avoid or 0 )

  if( not s00012ak__avoidCanPostUrl( this, avoid ) ) then
    -- sorry, we do not accept this from you.  We might send a system message but in theory
    -- we suppressed the menu, so there is no legal way for them to even make it this far.
    -- (but of course we check here anyway!)  note that admins must also be premium and not blocked
    this.gameKit:logMessage( 4, "Avatar " .. avoid 
                             .. " was not allowed (priv 29/ !55) to set flickr surface url " .. this.gamePiece:piecePoid() 
                             )
      
    return  
  end
   
  local legalUrl = ""
  local flickrPhotoId = ""
  local textUrl
  textUrl = s00012ak_getSafeText( this, query.url, 200 )

  if( not textUrl or ( textUrl == "" ) ) then
    -- submitting a blank url means you want to clear the current image
    this.gamePiece:setProperty( "url",     "",      GamePiecePropertyNull )
    this.gamePiece:setProperty( "photoId", "",      GamePiecePropertyNull )
    textUrl = "(cleared)" -- so we can log it
  else
    -- validate the url
    legalUrl, flickrPhotoId = s00012ak__parseFlickrUrl( this, textUrl )
    if ( legalUrl and flickrPhotoId ) then
      this.gamePiece:setProperty( "url",     legalUrl,      GamePiecePropertyNull )
      this.gamePiece:setProperty( "photoId", flickrPhotoId, GamePiecePropertyNull )
    else
      -- ignore this attempt to set an invalid url
      this.gameKit:logMessage( 4, "Avatar " .. avoid 
                               .. " gave a bad flickr surface url " .. this.gamePiece:piecePoid() 
                               .. " url: " .. textUrl )
      return
    end
  end

  -- if we changed the url, then update the authorDoid to match
  this.gamePiece:setProperty( "authorDoid",         avoid.."" ,   GamePiecePropertyNull )

  local numLayout
  local numZoom   = 0
  local numAspect = 1
  numLayout = tonumber( s00012ak_getSafeText( this, query.layout, 3 ) )
  if( numLayout == 1 ) then
    -- center image with bars
    numZoom   = 0
    numAspect = 1
  elseif( numLayout == 2 ) then
    -- stretch image to fill frame, distort image
    numZoom   = 0
    numAspect = 0
  elseif( numLayout == 3 ) then
    -- zoom image to fill frame, crop as needed
    numZoom   = 1
    numAspect = 1
  end
    
  -- note: while the piece no longer uses 'layout' directly, I still need to 
  -- set it here so it can be seen by the configuration page
  this.gamePiece:setProperty( "layout",         numLayout.."" ,   GamePiecePropertyNull )
  this.gamePiece:setProperty( "zoom",           numZoom   ,       GamePiecePropertyNull )
  this.gamePiece:setProperty( "preserveAspect", numAspect ,       GamePiecePropertyNull )

  this.gameKit:logMessage( 4, "Avatar " .. avoid 
                           .. " is configuring flickr surface " .. this.gamePiece:piecePoid() 
                           .. " layout: " .. numLayout 
                           .. " url: " .. textUrl )

  this.gamePiece:sendFact( avoid, "edit", ""..numLayout, textUrl, legalUrl, "" )
 
end

function s00012ak_onPropertiesReady( this )
  if( this.gameKit:isClient() ) then
    s00012ak__loadCommands( this )
    s00012ak__makeDisplay( this )
  end
end

function s00012ak_onPropertyChanged( this, key, value, flags )
  if( this.gameKit:isClient() ) then
    s00012ak__loadCommands( this )
    s00012ak__makeDisplay( this )
  end
end

function s00012ak_onEventStarted( this, id, details )
  this.gamePiece:sendClientPacket( DoidNull, 200, 0, 0, 0, 0, 0, 0, 0, 0 )
end

function s00012ak_onEventFinished( this, id )
  this.gamePiece:sendClientPacket( DoidNull, 200, 0, 0, 0, 0, 0, 0, 0, 0 )
end

function s00012ak_onClientPacket( this, avoid, code, num1, num2, num3, num4, num5, num6, num7, num8 )
  if( code == 200 ) then -- An event may have changed decorate permissions.
    s00012ak__loadCommands( this )
  end
end

function s00012ak_onServerPacket( this, avoid, code, num1, num2, num3, num4, num5, num6, num7, num8 )
  if( s00012ak__avoidCanPostUrl( this, avoid ) ) then
    local layout = this.gamePiece:property( "layout", GamePiecePropertyNull ) or ""
    
    if( code == 120 ) then
      -- client has asked us to set a random flickr photo
      s00012ak__pickRandomPhoto( this, avoid )
    end

  end
end

function s00012ak__makeDisplay( this )
  local piece = this.gamePiece:pieceConfiguration()
  local url = this.gamePiece:property( "url", GamePiecePropertyNull ) or ""
  local layout         = tonumber( this.gamePiece:property( "layout",         GamePiecePropertyNull ) or "0" )
  local zoom           = tonumber( this.gamePiece:property( "zoom",           GamePiecePropertyNull ) or "0" )
  local preserveAspect = tonumber( this.gamePiece:property( "preserveAspect", GamePiecePropertyNull ) or "0" )
  local authorDoid     = tonumber( this.gamePiece:property( "authorDoid",     GamePiecePropertyNull ) or "0" )

  if( url == "" ) then
    piece.displaySettings.enabled = 0
  else
    piece.displaySettings.enabled = 1
    local ww = 512
    local hh = 256
    if (1) then
      -- Recapping:
      -- * displaySize is the in-world dimension of the surface, can be any reasonable size
      -- * materialSize is for a 'virtual' graster and should match the aspect ratio of displaySize
      --   and right here we generate targetXYWH from materialSize
      --   it does NOT need power-of-two dimensions
      -- * textureSize should be {64,64} (small and power of two) 
      ww = piece.displaySettings.materialSize[1]
      hh = piece.displaySettings.materialSize[2]
    end
    piece.displaySettings.render = {
      {
        type = "image",
        targetXYWH = { 0, 0, ww, hh },
        preserveAspect = preserveAspect,
        zoom = zoom,
        directDraw = 1, -- enables direct use of texture on quad, instead of via intermediate graster
        layout = layout,
        url = url,
        authorDoid = authorDoid,
        hideIfIgnored = 1,  -- suppresses display if viewer is ignoring the author
      },
    }
  end
  this.gamePiece:updatePieceConfiguration( "Display" )
end

function s00012ak__avoidCanPostUrl( this, avoid )
  if( ( this.gameKit:avatarCanManipulate( avoid ) ) or 
      ( this.gameKit:avatarIsOwner( avoid ) ) or
      ( this.gameKit:avatarHasPrivilege( avoid, AvPrivStaffIcon ) ) )
  then
    -- this is the sort of person who should be able to configure me
    -- but I must also do some 'and' checking as well
    if(         this.gameKit:avatarHasPrivilege( avoid, AvPrivInPermanentMemberProgram )   -- must be premium member
        and not this.gameKit:avatarHasPrivilege( avoid, AvPrivBlockInteractivePublishing ) -- and not have lost the privilege
      )
    then
      return 1 -- remember, return 0 is also 'true'
    end
  end

  return nil -- guess not
end

function s00012ak__loadCommands( this )
  local piece = this.gamePiece:pieceConfiguration()
  piece.commandSettings.commands = {}
  local n = 1
  local avoid = this.gameKit:pilotDoid()
  if( s00012ak__avoidCanPostUrl( this, avoid ) ) then
    piece.commandSettings.commands[ n ] = { gkfwCmdActionKit, "CONFIGURE",  100 }
    n = n + 1
   -- piece.commandSettings.commands[ n ] = { gkfwCmdActionKit, "RANDOM PHOTO",  120 }
   -- n = n + 1
  end
  -- everyone sees this one
  piece.commandSettings.commands[ n ] = { gkfwCmdActionKit, "PHOTO INFO", 102}
  n = n + 1
  -- everyone sees this one
  piece.commandSettings.commands[ n ] = { gkfwCmdActionKit, "REPORT PHOTO", 101 }
  n = n + 1

  this.gamePiece:updatePieceConfiguration( "Command" )
end

function s00012ak_getSafeText( this, raw, length )
  local text = tostring( raw or "" )
  text = gsub( text, "^%s*(.-)%s*$", "%1" )
  text = strsub( text, 1, length )
  if( text ~= "" ) then
    return( text )
  end
  return( nil )
end

----------------------------------------------
-- Experimental (68.142.214.24)(207.57.118.86)

function s00012ak__makeFlickrApiUrl( method, args )
  return "https://api.flickr.com/services/rest/?method="
       .. (method or "")
       .. "&api_key=e5a62459c31d261328970d707e059673"
       .. (args or "" )
end

s00012ak_global_photoUrl = ""
s00012ak_global_photoId  = ""

function s00012ak__getFirstPhotoFromText( rawText )

-- in: <photo title="VIOLINIST " id="4173984101" secret="664e7c49f5" server="2466" farm="3" owner="25612936@N08"
-- out: http://farm2.static.flickr.com/1337/1377322666_469699129b_m.jpg

  s00012ak_global_photoId  = ""
  s00012ak_global_photoUrl = ""

  local result, num = gsub( rawText, 
                            " id=\"([%d%l%u]+)\" +secret=\"([%d%l%U]+)\" +server=\"(%d+)\" +farm=\"(%d+)\"",  
                            function( id, secret, server, farm )
                              local url =  "https://farm"
                                        .. tostring( farm     or 0 )
                                        .. ".static.flickr.com/"
                                        .. tostring( server   or 0 )
                                        .. "/"
                                        .. tostring( id       or 0 )
                                        .. "_"
                                        .. tostring( secret   or 0 )
                                        .. ".jpg"  -- 512
                                  --    .. "_m.jpg"  -- 256
                              if( s00012ak_global_photoUrl == "" ) then
                                -- how do I break out after the first one, anyway?
                                s00012ak_global_photoId  = tostring( id       or 0 )
                                s00012ak_global_photoUrl = url
                              end
                              return "" -- this doesn't do what you'd think 
                            end 
                           )

  return s00012ak_global_photoId, s00012ak_global_photoUrl
end

function s00012ak__pickRandomPhoto( this, avoid )
  -- i really want an http request, not an avman request, but let's do this in baby steps
  local command = s00012ak__makeFlickrApiUrl( "flickr.panda.getPhotos", 
                                              "&panda_name=ling+ling" )
  local isXml = 0
  --this.gameKit:logMessage( 4, "DJSXX Making http  request for random photo from avoid " .. avoid .. ", command: " .. command )
  this.gamePiece:sendHttpRequest( command, isXml, {req = "panda", authorDoid = avoid} )
end

function s00012ak_onHttpResult( this, url, data, custom )
  if( isString( data ) and isTable( custom ) ) then
    --this.gameKit:logMessage( 4, "DJSXX Received http string " .. data .. " for " .. url )
    local photoUrl = ""
    local photoId  = ""
    -- we pick a random starting point and then scan for the first photo after that point
    local len = strlen( data )
    local startHere = data;
    if( len > 300 ) then
      local start = random( len-200 )
      this.gameKit:logMessage( 4, "DJSXX photo list length " .. (len or "") .. ", random " .. (start or "") )
      startHere = strsub( data, start )
    end
    --this.gameKit:logMessage( 4, "DJSXX scanning photos from " .. (startHere or "") )
    photoId, photoUrl = s00012ak__getFirstPhotoFromText( startHere )
    this.gameKit:logMessage( 4, "DJSXX decoded first photo " .. (photoUrl or "") )
    if( isString( photoUrl ) 
       and      custom.authorDoid 
       and not (photoUrl == "") ) then
      -- set it 
      this.gamePiece:setProperty( "url",         photoUrl,                GamePiecePropertyNull )
      this.gamePiece:setProperty( "photoId",     photoId,                 GamePiecePropertyNull )
      this.gamePiece:setProperty( "authorDoid",  custom.authorDoid.."" ,  GamePiecePropertyNull )
    end
  else
    this.gameKit:logMessage( 3, "DJSXX Received unknown response " .. data .. " for " .. url )
  end
end

function s00012ak_onPilotChanged( this, avoid, code )
  -- rebuild my menu
  if( this.gameKit:isClient() ) then
    this.gameKit:logMessage( 4, "DJSXX onPilotChanged " .. (avoid or "") )
    s00012ak__loadCommands( this )
    s00012ak__makeDisplay( this )
  end
end
