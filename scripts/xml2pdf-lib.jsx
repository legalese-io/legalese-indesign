// library used by
// xml2pdf       -- the interactive runtime
// xml2pdf-sleep -- the idle task launched once which continuously monitors the Legalese Incoming folder
//
// mengwong@legalese.io mengwong@jfdi.asia 20150104

#include "/Applications/Adobe InDesign CC 2014/Scripts/XML Rules/glue code.jsx"

// -------------------------------------------------- xmls2pdf
function xmls2pdf(xmlFiles, showingWindow, saveIndd, keepOpen) {
  if (showingWindow == undefined) showingWindow = false;
  var errors = [];
  app.textPreferences.smartTextReflow = false;
  for (var i in xmlFiles) {
	var xmlFile = xmlFiles[i];
	try {
	  logToFile("xmls2pdf: starting " + xmlFile.fullName);

	  // maybe each xmlFile can specify its desired indt template filename?
	  var indtFile = identifyIndtFile("fromXML", // fromXML | hardcoded | queryUser
									  "~/src/legalese-indesign/indt/coverpage.indt",
									  xmlFile
									 );

	  var doc = importXmlIntoTemplate(xmlFile, indtFile, showingWindow);
	  doc.textPreferences.smartTextReflow = false;
//	  doc.textPreferences.limitToMasterTextFrames = false;
//	  doc.textPreferences.deleteEmptyPages = true;

	  initialAdjustments(doc);
	  doc.recompose(); // force smart text reflow otherwise the signature fields won't add properly.
	  addCrossReferences(doc);
	  handleSpanStyles(doc);
	  logToFile("xmls2pdf: about to constructFormFields. page length is " + doc.pages.length);
	  constructFormFields(doc);
	  setSignaturePageToAMaster(doc);
	  deleteEmptyStories(doc);
	  // findAndReplace(doc); change " to ''
	  // trim trailing newlines from the document. not quite sure how to do this.
	  doc.recompose();
	  doc.updateCrossReferences();
	  logToFile("xmls2pdf: about to exportToPDF");
	  exportToPDF(doc, xmlFile);
	  var deleteXML = true;
//	  if ("google Drive pops up an annoying modal dialog saying Heads Up, you just deleted something") {
//		// this is true as of 1.28.1549.1322 on 20160309
//		deleteXML = false;
//		// so that the system doesn't hang
//	  }
	  if (saveIndd || doc.label.match(/saveIndd=true/)) { saveAsIndd(doc, xmlFile); deleteXML = false; }
	  if (! keepOpen && doc && doc.isValid) { doc.close(SaveOptions.NO);
											  if (deleteXML) { xmlFile.remove() }
											}
	  logToFile("xmls2pdf: finished " + xmlFile.fullName);
	}
	catch (error) {
	  saveFail(xmlFile, error);
	  errors.push(xmlFile.fullName + ": " + error);
	  if (! showingWindow && doc && doc.isValid) doc.close(SaveOptions.NO);
	}
  }
  if (showingWindow && errors.length > 0) { alert (errors) }
}

// -------------------------------------------------- addCrossReferences
function addCrossReferences(doc) {
  __processRuleSet(doc.xmlElements.item(0), [new LearnParagraphDestinations(doc)]);
  __processRuleSet(doc.xmlElements.item(0), [new InsertCrossReferences(doc)     ]);
}

// -------------------------------------------------- handleSpanStyles
function handleSpanStyles(doc) {
  __processRuleSet(doc.xmlElements.item(0), [new SpanStyles(doc)     ]);
}

// -------------------------------------------------- LearnParagraphDestinations
// the first part of the crossreferences logic.
// we look for paragraphs with an "xname" attribute.
// we define doc.paragraphDestinations named accordingly.
// ... <para_2_numbered xname="foo"> ...
function LearnParagraphDestinations(doc){
  this.name = "LearnParagraphDestinations";
  this.xpath = "//*[@xname]";
  this.apply = function(myElement, myRuleProcessor){
	doc.paragraphDestinations.add(myElement.paragraphs.item(0), { name: myElement.xmlAttributes.item("xname").value });
	logToFile("crossreferences: learning destination named " + myElement.xmlAttributes.item("xname").value);
    return true;
  }
}

// -------------------------------------------------- InsertCrossReferences
// ... <xref to="foo" /> ...
// ... <xref to="foo" format="Paragraph Number" /> ...
// ... <xref to="foo" format="Paragraph Number (firstbold)" /> ...
function InsertCrossReferences(doc) {
  this.name = "InsertCrossReferences";
  this.xpath = "//xref";
  this.apply = function(myElement, myRuleProcessor){
	var dest = doc.paragraphDestinations.item(myElement.xmlAttributes.item("to").value);
	if (! dest.isValid) { logToFile("crossreferences: encountered xref to="+myElement.xmlAttributes.item("to").value+ ", which appears to be undefined."); return false; }
	var crf = myElement.xmlAttributes.item("format").isValid ? myElement.xmlAttributes.item("format").value : "Paragraph Number";
	var src = doc.crossReferenceSources.add(myElement.insertionPoints.item(0), doc.crossReferenceFormats.itemByName(crf));
	logToFile("crossreferences: creating link " + myElement.xmlAttributes.item("to").value);
	doc.hyperlinks.add(src,dest);

	// TODO: turn the space before the src into a nonbreaking space
    return true;
  }
}

// -------------------------------------------------- SpanStyles
// ... <span style="font-family: XXX; font-style: YYY">Text</span>
function SpanStyles(doc) {
  this.name = "SpanStyles";
  this.xpath = "//span[@style]";
  var xtbl = { "font-family" : "appliedFont",
			   "font-style"  : "fontStyle" };
  this.apply = function(myElement, myRuleProcessor) {
	if (myElement.xmlAttributes.item("style").isValid) {
	  logToFile("SpanStyles: found <span style> with " + myElement.xmlAttributes.item("style").value);
	  var styles = myElement.xmlAttributes.item("style").value.split(/;\s+/);
	  var characterStyleObj = { };
	  for (var style_i in styles) {
		var expr = styles[style_i].split(/\s*:\s*/);
		characterStyleObj[xtbl[expr[0]] || expr[0]] = expr[1];
		// create unique signature/name for the characterstyle so we don't have to recreate one each time
	  }
	  var objKeys = [];
	  var objValues = [];
	  for (var cSk in characterStyleObj) { objKeys.push(cSk); objValues.push(characterStyleObj[cSk]) }
	  logToFile("SpanStyles: applying characterStyle (keys=" + objKeys + "), values=("+objValues+")");
	  var characterStyle = doc.characterStyles.add(characterStyleObj);
	  myElement.xmlContent.applyCharacterStyle(characterStyle);
	}
	return true;
  }
}

// -------------------------------------------------- isXmlOrFolder
function isXmlOrFolder(file) {
  return (file.constructor.name == "Folder"
		  || file.name.match(/\.xml$/));
}

// -------------------------------------------------- findXmls
function findXmls(folder) {
  var toreturn = [];
  var candidates = folder.getFiles(isXmlOrFolder);
  for (var i in candidates) {
	if (candidates[i].constructor.name == "File") {
	  toreturn.push(candidates[i]);
	}
	else {
	  var moreFiles = findXmls(candidates[i]);
	  for (var j in moreFiles) {
		toreturn.push(moreFiles[j]);
	  }
	}
  }
  return toreturn;
}

// -------------------------------------------------- identifyXmlFiles
function identifyXmlFiles(mode, rootFolder) {
  var xmlFiles = [];
  if (mode == "recurse") {
	// the idle task will monitor the incoming folder for XML files
	var todo = findXmls(rootFolder);
	for (var i in todo) {
	  var xmlFile = todo[i];
	  if (hasPDF(xmlFile))  { // logToFile(xmlFile.fsName + " ... PDF output exists, nothing to do.");
							  continue; }
	  if (hasFail(xmlFile)) { // logToFile(xmlFile.fsName + " ... fail file exists, nothing to do. delete the .fail.txt to try again.");
							  continue; }
	  else { xmlFiles.push(xmlFile); }
	}
  }
  else if (mode == "queryUser"
		  || mode == undefined) {
	xmlFiles = File.openDialog(
	  "Choose one or more source XML files to place into the Legalese template",
	  isXmlOrFolder,
	  true); // multiselect
  }
  return xmlFiles;
}

// -------------------------------------------------- identifyIndtFile
function identifyIndtFile(mode, path, xmlFile) {
  var indtFile;
  if (mode == "fromXML") {
	xmlFile.open("r");
	var myXML = new XML(xmlFile.read());
	xmlFile.close();

	var templateSpec = myXML.attribute("templateSpec").toString();

	if (templateSpec != undefined && templateSpec.length) {
	  logToFile("identifyIndtFile: read templateSpec = " + templateSpec + " out of XML file.");
	  path = "~/non-db-src/l/indesign/indt/" + templateSpec;
	  mode = "hardcoded";
	}
	else {
	  logToFile("identifyIndtFile: tried to read templateSpecout of XML file, but it's undefined.");
	  if (path.length)	mode = "hardcoded";
	  else				mode = "queryUser";
	} 
  }
  // not an else if because we cascade from above
  if (mode == "hardcoded") {
	logToFile("identifyIndtFile: trying to open " + path);
	indtFile = new File(path);
	logToFile("identifyIndtFile: got back indtFile " + indtFile);
	if (! indtFile.exists) throw("unable to open specified indtFile: " + path);
  } 
  // not an else if because we cascade from above
  if (mode == "queryUser"
	  || mode == undefined
	 ) {
	logToFile("identifyIndtFile: default path -- mode = " + mode);
	indtFile = File.openDialog(
	  "Choose the Legalese template",
	  function(file) {
		return (file.constructor.name == "Folder"
				|| file.name.match(/\.indt$/));
	  },
	  false); // multiselect
  }
  logToFile("identifyIndtFile: returning indtFile" + indtFile.name);
  return indtFile;
}

// -------------------------------------------------- importXmlIntoTemplate
function importXmlIntoTemplate(xmlFile, indtFile, showingWindow) {
  // here goes Chapter 12 of the Indesign Scripting Guide for JavaScript

  // iterate through each element. if its tag corresponds to a paragraph style (as opposed to a character style) then append a trailing newline unless the element already has one.

  logToFile("importXmlIntoTemplate("+indtFile+"): starting");
  var doc = app.open(indtFile, showingWindow);
  logToFile("importXmlIntoTemplate("+indtFile+"): app.open() succeeded: doc is " + doc);
  logToFile("importXmlIntoTemplate("+indtFile+"): doc.isValid = " + doc.isValid);

  var importMaps = {};
  for (var i = 0; i < doc.xmlImportMaps.length; i++) {
	importMaps[doc.xmlImportMaps.item(i).markupTag.name] = doc.xmlImportMaps.item(i).mappedStyle;
  }
  logToFile("importXmlIntoTemplate("+indtFile+"): importMaps loaded");

  // define the default master for body text
  if (doc.xmlElements.item(0).xmlAttributes.item("defaultMaster").isValid)
	doc.pages.item(-1).appliedMaster = doc.masterSpreads.item(doc.xmlElements.item(0).xmlAttributes.item("defaultMaster").value);
  
  logToFile("importXmlIntoTemplate("+indtFile+"): running importXML("+xmlFile+")");
  // if your XML content has an href attribute, it will be interpreted specially: https://helpx.adobe.com/indesign/using/structuring-documents-xml.html
  // so, legalese uses the hhref attribute instead of href.
  doc.xmlElements.item(0).importXML(xmlFile);
  logToFile("importXmlIntoTemplate("+indtFile+"): returned from importXML("+xmlFile+")");

  if (doc.xmlElements.item(0).xmlAttributes.item("addnewline").isValid &&
	  doc.xmlElements.item(0).xmlAttributes.item("addnewline").value == "false") {
	logToFile("not adding newlines");
  } else {
	logToFile("calling AddReturns ruleset");
	__processRuleSet(doc.xmlElements.item(0), [new AddReturns(doc,importMaps) ]);
  }

  // if the root element has saveIndd=true then set doc.label to saveIndd ... this is read by main()
  if (doc.xmlElements.item(0).xmlAttributes.item("saveIndd").isValid &&
	  doc.xmlElements.item(0).xmlAttributes.item("saveIndd").value == "true") {
	if (doc.label && doc.label.length) { doc.label += "\n" }
	logToFile("source XML wants us to saveIndd");
	doc.label += "saveIndd=true\n";
  }

  // if the root element has omitDate=true then set doc.label to omitDate ... this is read by main()
  if (doc.xmlElements.item(0).xmlAttributes.item("omitDate").isValid &&
	  doc.xmlElements.item(0).xmlAttributes.item("omitDate").value == "true") {
	if (doc.label && doc.label.length) { doc.label += "\n" }
	logToFile("source XML wants us to omitDate");
	doc.label += "omitDate=true\n";
  }

  logToFile("calling InsertTextVariables ruleset");
  
  __processRuleSet(doc.xmlElements.item(0), [new InsertTextVariables(doc,importMaps) ]);

  logToFile("mapping tags to styles, with error trapping");

  try {
	doc.mapXMLTagsToStyles();
  } catch (e) {
	logToFile("caught error: "+ e);
  };

  // findReplaceFixes
  findReplaceFixes(doc, doc.stories);

  doc.stories.everyItem().recompose();

  __processRuleSet(doc.xmlElements.item(0), [new RestartParagraphNumbering(doc,importMaps),
											 new ParagraphOverrides(doc,importMaps),
											 new Hyperlinks(doc,importMaps),
											]);

  return doc;
}

function initialAdjustments(doc) {
  var XMLRoot = doc.xmlElements[0];
  if (XMLRoot.xmlAttributes.item("font-family").isValid) {
	doc.paragraphStyles.item("[Basic Paragraph]").appliedFont = XMLRoot.xmlAttributes.item("font-family").value;
  }
  if (XMLRoot.xmlAttributes.item("font-style").isValid) {
	doc.paragraphStyles.item("[Basic Paragraph]").fontStyle = XMLRoot.xmlAttributes.item("font-style").value;
  }

  // if a paragraph ends with :-? then set its keepWithNext to 1
  // TODO: sadly, this doesn't always work. maybe .contents has some hidden characters or XML that causes it to not match /$/.
  for (var story_i = 0; story_i<doc.stories.length; story_i++) {
	var paras = doc.stories.item(story_i).paragraphs;
	for (var pi=0; pi<paras.length; pi++) {
	  var para = paras.item(pi);
	  if (para.contents.match(/:-* *$/) || para.contents.match(/:-* *\r/)) {
		para.keepWithNext = 1;
	  }
	}
  }

  // delete the text of the timestamp frame on the master page(s) if omitDate == true
  if (doc.label.match(/omitDate=true/)) {
	logToFile("*** honouring omitDate=true");
	// http://www.indiscripts.com/post/2010/06/on-everyitem-part-1
	doc.masterSpreads.everyItem().textFrames.itemByName("datestamp").contents="";
  }
}

// -------------------------------------------------- setSignaturePageToAMaster
function setSignaturePageToAMaster(doc) {
  // normally we use a B master because it contains the running sub right which is a schedule header
  // but the signature page should be on an A master because it has no schedule header
  // so, starting from the back, we look for the page that contains paragraph style chapter header with text Signature
  // maybe we use the Find command for this
  // and we then set the current page to the A master, and all subsequent pages too.
  var story = doc.pages.item(-1).textFrames.item(0).parentStory;

  // search backward for a chapter header titled Signatures
  var signatures_para;

  for (var i=story.paragraphs.length-1; i > 0; i--) {
	var para = story.paragraphs.item(i);
	if (para.appliedParagraphStyle.name == "chapter header" &&
		para.contents.match(/Signature/i)
	   ) {
	  signatures_para = para;
	  break;
	}
  }
  if (signatures_para == undefined) return;

  var signatures_page = signatures_para.parentTextFrames[0].parentPage;
  if (signatures_page == undefined || ! signatures_page.isValid) return;

  var signatureMaster = doc.masterSpreads.item(
	doc.xmlElements.item(0).xmlAttributes.item("signatureMaster").isValid
	  ? doc.xmlElements.item(0).xmlAttributes.item("signatureMaster").value
	  : "A-Master");

  // set A master for the current page and all subsequent pages
  for (var i=signatures_page.documentOffset; i < doc.pages.length; i++) {
	doc.pages[i].appliedMaster = signatureMaster;
  }
}

function isLastPara(para) {
  var nextPara = para.paragraphs[-1].insertionPoints[-1].paragraphs[0];
  if (nextPara == para) {
	logToFile("found last para: " + para.contents);
	return true;
  }
  return false;
}

function isLastElement(el) {
  var parent = el.parent;
  if (parent.constructor.name != "XMLElement") { return }
  var index = el.index;
  if (index == el.parent.xmlItems.length-1) { logToFile("isLastElement: we (" + el.markupTag.name + ") are the last element in parent (" + el.parent.markupTag.name+")");
											   return true; }
  return false;
}

// -------------------------------------------------- AddReturns
function AddReturns(doc, importMaps){
  this.name = "AddReturns";
  this.xpath = "//*";
  this.apply = function(myElement, myRuleProcessor){

//	logToFile("AddReturns: applying. ------------------------");
//	logToFile("AddReturns: considering " + importMaps[myElement.markupTag.name]);
//	logToFile("AddReturns: it is " + myElement.markupTag.name + " XML element ("+myElement.index+")");

	if ((myElement.xmlAttributes.item("addnewline").isValid &&
		 myElement.xmlAttributes.item("addnewline").value == "true")
		|| (importMaps[myElement.markupTag.name] != undefined
			&& importMaps[myElement.markupTag.name].constructor.name == "ParagraphStyle"
			&& importMaps[myElement.markupTag.name].name != "[Basic Paragraph]"
			&& (! importMaps[myElement.markupTag.name].name.match(/^cell/))
			&& myElement.markupTag.name != "Table"
			&& myElement.markupTag.name != "Cell"
			&& (! myElement.markupTag.name.match(/^cell/i))
			&& (! myElement.xmlAttributes.item("addnewline").isValid ||
				myElement.xmlAttributes.item("addnewline").value != "false")
			&& (! myElement.contents.match(/\r$/))
			&& (! isLastElement(myElement))
		   )
	   ) {
	  // logToFile("AddReturns: last paragraph: " + myElement.paragraphs.lastItem().contents.substr(0,30));
	  logToFile("AddReturns: will append newline to element " + myElement.markupTag.name);
      myElement.insertTextAsContent("\r", XMLElementPosition.ELEMENT_END);
	}
    return false;
  }
}

// -------------------------------------------------- findReplaceFixes
function findReplaceFixes(doc, stories) { 
    //Clear the find/change text preferences.
    app.findTextPreferences = NothingEnum.nothing;
    app.changeTextPreferences = NothingEnum.nothing;

  logToFile("findReplaceFixes(): starting");

    //Set the find options.
    app.findChangeTextOptions.caseSensitive = false;
    app.findChangeTextOptions.includeFootnotes = false;
    app.findChangeTextOptions.includeHiddenLayers = false;
    app.findChangeTextOptions.includeLockedLayersForFind = false;
    app.findChangeTextOptions.includeLockedStoriesForFind = false;
    app.findChangeTextOptions.includeMasterPages = false;
    app.findChangeTextOptions.wholeWord = false;

  logToFile("findReplaceFixes(): smart doublequotes");
    // equivalent to the preset that replaces dumb doublequotes with smart doublequotes
    app.findTextPreferences.findWhat = '^"';
    app.changeTextPreferences.changeTo = '"';
    stories.everyItem().changeText();

  logToFile("findReplaceFixes(): smart singlequotes");
    // equivalent to the preset that replaces dumb singlequotes with smart singlequotes
    app.findTextPreferences.findWhat = '^\'';
    app.changeTextPreferences.changeTo = '\'';
    stories.everyItem().changeText();

  logToFile("findReplaceFixes(): triple dashes to emdash");
    // replace triple dashes with single emdash
    app.findTextPreferences.findWhat = '---';
    app.changeTextPreferences.changeTo = '^_';
    stories.everyItem().changeText();

  logToFile("findReplaceFixes(): double dashes to endash");
    // equivalent to the preset that replaces a double dash with a single endash
    app.findTextPreferences.findWhat = '--';
    app.changeTextPreferences.changeTo = '^=';
    stories.everyItem().changeText();

  logToFile("findReplaceFixes(): rupee needs minion pro");
    // change any instance of the rupee symbol to minion pro because adobe text pro doesn't support it at the moment
    app.findTextPreferences.findWhat   = 
    app.changeTextPreferences.changeTo = String.fromCharCode(0x20B9);
    app.changeTextPreferences.appliedFont = 'Minion Pro';
    app.changeTextPreferences.fontStyle = 'Regular';
    stories.everyItem().changeText();

  logToFile("findReplaceFixes(): done!");
    //Clear the find/change text preferences after the search.
    app.findTextPreferences = NothingEnum.nothing;
    app.changeTextPreferences = NothingEnum.nothing;
}


// -------------------------------------------------- InsertTextVariables
function InsertTextVariables(doc, importMaps){
  this.name = "InsertTextVariables";
  this.xpath = "//textvar";	
  this.apply = function(myElement, myRuleProcessor){
	var myInsertionPoint = myElement.insertionPoints.item(0);
	var textVariableInstance = myInsertionPoint.textVariableInstances.add({associatedTextVariable: doc.textVariables.item( myElement.xmlAttributes.item("name").value ) });
    return false;
  }
}

// TODO: look for a restart=true attribute and tell the paragraph bullet & numbering to restart.
// -------------------------------------------------- RestartParagraphNumbering
function RestartParagraphNumbering(doc, importMaps){
  this.name = "RestartParagraphNumbering";
  this.xpath = "//*[@restart='true']";
  this.apply = function(myElement, myRuleProcessor){

	myElement.paragraphs.item(0).numberingContinue = false;

    return true;
  }
}

// <someparagraph override="property=value">
// -------------------------------------------------- ParagraphOverrides
function ParagraphOverrides(doc, importMaps){
  this.name = "ParagraphOverrides";
  this.xpath = "//*[@override]";
  this.apply = function(myElement, myRuleProcessor){

	var overrides = myElement.xmlAttributes.item("override").value.split(/  +/); // separate key/value pairs using two spaces
	for (var i=0; i<overrides.length; i++) {
	  var kv = overrides[i].split("=");
	  var key = kv[0];
	  var val = kv.splice(1).join("=");
	  logToFile("trying to set paragraph override " + key + "=" + val);
	  // TODO: security considerations: eval() is not acceptable because
	  // input val is not trusted. need to rephrase.
	  try {
		var evaled = val;
		if (val == "true" ||
			val == "false" ||
			val.match(/^[a-zA-Z0-9_.]+$/)) {
		  evaled = eval(val);
		  logToFile("evaluated " + val + ", became " + evaled);
		}
		else if (val.match(/^'(.*)'$/)) { evaled = val.match(/^'(.*)'$/)[1] }
		myElement.paragraphs.item(0)[key] = evaled; } catch (e) { logToFile("error trying to set paragraph override " + key + "=" + val + ": "+e) };
	}

    return false;
  }
}

// convert <a href="http://...">text</a> to hyperlinks
function Hyperlinks(doc, importMaps) {
  this.name = "Hyperlinks";
  this.xpath = "//*[@hhref]";
  this.apply = function(elem, ruleProcessor) {
    var elemText = elem.texts[0];
    var linkURL = elem.xmlAttributes.itemByName("hhref").value;
    var linkSource = doc.hyperlinkTextSources.add(elemText);
    var linkDest = doc.hyperlinkURLDestinations.add(linkURL);
	logToFile("trying to create link for text " + elemText + " to " + linkDest);
    doc.hyperlinks.add(linkSource, linkDest);
    return true;
  }
}


function myGetBounds(myDocument, myPage){
	var myPageWidth = myDocument.documentPreferences.pageWidth;
	var myPageHeight = myDocument.documentPreferences.pageHeight
	if(myPage.side == PageSideOptions.leftHand){
		var myX2 = myPage.marginPreferences.left;
		var myX1 = myPage.marginPreferences.right;
	}
	else{
		var myX1 = myPage.marginPreferences.left;
		var myX2 = myPage.marginPreferences.right;
	}
	var myY1 = myPage.marginPreferences.top;
	var myX2 = myPageWidth - myX2;
	var myY2 = myPageHeight - myPage.marginPreferences.bottom;
	return [myY1, myX1, myY2, myX2];
}


// -------------------------------------------------- deleteEmptyStories
function deleteEmptyStories(doc) {
  logToFile("about to processRuleSet deleteEmptyStories_");
  __processRuleSet(doc.xmlElements.item(0), [new deleteEmptyStories_(doc)
											]);
}

// -------------------------------------------------- deleteEmptyStories_
function deleteEmptyStories_(doc) {
  this.name = "deleteEmptyStories_";
  this.xpath = "//*[@delete_if_empty='true']";
  this.apply = function(el, myRuleProcessor){
//	alert("found an xmlElement with delete_if_empty = true\nparagraphs.length is " + el.paragraphs.length);
	if (el.paragraphs.length == 0) {
	  var pTF = el.insertionPoints.item(0).parent.texts.item(0).parentTextFrames[0];
	  pTF.remove();
	  __skipChildren(myRuleProcessor);
	  el.remove();
	}
	return true;
  }
}

// -------------------------------------------------- constructFormFields
function constructFormFields(doc) {
//  alert("constructFormFields running");

  // for each signature table in the signaturs page,
  // create a new textframe adjacent to the signature table, anchored,
  // and set the name of the field to be something that echosign will respect --
  // in other words, <sometext>_es_signer<n>_signature

  doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.points;
  doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.points;

  var appendPages = true;
  
  // if smart text reflow has not completed,
  // then the signaturepage is in the overset region, and adding an anchored object
  // is eventually going to barf when we try to do anything with geometricbounds.

  var XMLRoot = doc.xmlElements[0];
  if (XMLRoot.xmlAttributes.item("appendPages").isValid && XMLRoot.xmlAttributes.item("appendPages").value == "false") { appendPages = false };
  
  // so we kludge by adding a last page to the document
  // we add a text frame to that page
  // and we manually thread the text frame
  // https://forums.adobe.com/thread/1675713	
  if (appendPages) {
	
	doc.textPreferences.smartTextReflow = false;
	//doc.textPreferences.limitToMasterTextFrames = false;
	//doc.textPreferences.deleteEmptyPages = false;
	//doc.textPreferences.addPages = AddPageOptions.END_OF_DOCUMENT;

	var lastpage = doc.pages.item(-1);
	var lasttextframe = lastpage.textFrames.item(-1);
	logToFile("the lastpage is " + lastpage.name);
	logToFile("the last textframe is " + lasttextframe.name);

	doc.recompose();
	logToFile("the lastpage is " + lastpage.name);

	var pages_to_add = 30;
	var new_pages = [];

	logToFile("creating " + pages_to_add + " pages because smart text reflow page addition doesn't run right under scripting and creates invalid object errors when i try to create an anchored signature box.");
	for (var i = 0; i < pages_to_add; i++) {
	  var np = doc.pages.add();
	  var np_textframe = np.textFrames.add({geometricBounds: myGetBounds(doc, np)});
	  new_pages[i] = np;
	  if (i > 0 && (i < pages_to_add-1)) { new_pages[i-1].textFrames.item(0).nextTextFrame = new_pages[i].textFrames.item(0); }
	}

	lasttextframe.nextTextFrame = new_pages[0].textFrames.item(0);

	logToFile("against all odds, that succeeded");
  }

  doc.recompose();

  logToFile("about to processRuleSet AddFormFields");
  __processRuleSet(doc.xmlElements.item(0), [new AddFormFields(doc)
											]);

  if (appendPages) {
	logToFile("processRuleSet AddFormFields completed successfully. removing last page.");
	// now we get rid of the excess pages.
	doc.textPreferences.smartTextReflow = true;
	doc.textPreferences.limitToMasterTextFrames = false;
	doc.textPreferences.deleteEmptyPages = true;

  // trigger smart text reflow by adding a new textframe.

	logToFile("trigger reflow by linking last text frames");
	var lasttextframe = doc.pages.item(-2).textFrames.item(0);
	var  newtextframe = doc.pages.item(-1).textFrames.item(0);
	logToFile("attaching text frames");
	lasttextframe.nextTextFrame = newtextframe;
	logToFile("new text frame added.");

//	var myProfile = app.preflightProfiles.item(0);
//	var myProcess = app.preflightProcesses.add(doc, myProfile);
//	logToFile("giving time for smart text reflow");
//	myProcess.waitForProcess(20);
//	myProcess.remove();
//	alert("giving time for smart text reflow. page length is " + doc.pages.length);

//  np.remove();
  }
  doc.recompose();
}


// -------------------------------------------------- addFormFields
function AddFormFields(doc) {
  this.name = "AddFormFields";
  this.xpath = "//table_enclosing_para[@class='signatureblock' and @unmailed='true']";
  this.apply = function(el, myRuleProcessor){

	var myInsertionPoint = el.paragraphs.item(0).insertionPoints.item(2);

	var signatureField = myInsertionPoint.signatureFields.add();
	logToFile("created signatureField. setting anchored object settings. " +signatureField );

	with(signatureField.anchoredObjectSettings){
	  pinPosition = false;
	  anchoredPosition = AnchorPosition.anchored;
	  anchorPoint = AnchorPoint.topLeftAnchor;
	  horizontalReferencePoint = AnchoredRelativeTo.anchorLocation;
	  horizontalAlignment = HorizontalAlignment.leftAlign;
	  anchorXoffset = -160; // this needs to match the template's columnWidth
	  verticalReferencePoint = VerticallyRelativeTo.lineBaseline;
	  anchorYoffset = 0;
	  anchorSpaceAbove = 0;
	}

	// maybe preflighting will give the system time for a recompose?
	doc.recompose();

	logToFile("will i die?");
	signatureField.geometricBounds = [0,0,55,216];
	logToFile("probably died.");

	// https://secure.echosign.com/doc/TextFormsTutorial.pdf
	// http://bgsfin.com/Add-Ons/SmartFormsTutorial.pdbf
    // that url has stopped working. check web.archive.org
    // or https://github.com/legalese/legalese-indesign/blob/master/doc/SmartFormsTutorial.pdf

	if (el.xmlAttributes.item("unmailed").isValid) {
	  logToFile("el.xmlAttributes.item(unmailed) = " + el.xmlAttributes.item("unmailed").value);
	  
	  if (el.xmlAttributes.item("unmailed").value == "true") {
		var signatureCount = el.xmlAttributes.item("esnum").value;
		logToFile("setting signature field name to " + "legalese_es_signer" + signatureCount + "_signature");
		signatureField.name = "legalese_es_signer" + signatureCount + "_signature";
	  }
	}
	
	doc.recompose();

	return false;
  }
}

// -------------------------------------------------- exportToPDF
// TODO: fix this by
// outputting the PDF to a temporary folder
// atomically testing for the continued existence of the output folder
// mv'ing the output PDF into the output folder
// https://app.asana.com/0/1404297026932/49012096355071

function exportToPDF(doc, xmlFile) {
  var pdfPath = xmlFile.fsName.replace(/\.xml$/, ".pdf");
  with(app.interactivePDFExportPreferences){
	viewPDF = false;
	pdfJPEGQuality = PDFJPEGQualityOptions.HIGH;
	rasterResolution = 300;
  }
  try {
	doc.exportFile(ExportFormat.interactivePDF,
				   new File(pdfPath),
				   false);
  } catch (e) {
	logToFile("exportToPDF: failed: " + e);
  }
}

// -------------------------------------------------- saveAsINDD
function saveAsIndd(doc, xmlFile) {
  var inddPath = xmlFile.fsName.replace(/\.xml$/, ".indd");
  doc.save(new File(inddPath));

  // TODO: export to IDML as well, for those with older versions of InDesign.
  // http://jongware.mit.edu/idcs6js/pe_ExportFormat.html
}

// -------------------------------------------------- saveFail
function saveFail(xmlFile, contents) {
  var failPath = xmlFile.fsName.replace(/\.xml$/, ".fail.txt");
  var file = new File(failPath);
  file.open("a");
  file.writeln(contents);
  file.close();
}

// -------------------------------------------------- hasPDF
function hasPDF(xmlFile) {
  var pdfPath = xmlFile.fsName.replace(/\.xml$/, ".pdf");
  return ((new File(pdfPath)).exists);
}

// -------------------------------------------------- hasFail
function hasFail(xmlFile) {
  var failPath = xmlFile.fsName.replace(/\.xml$/, ".fail.txt");
  return (new File(failPath)).exists;
}

// -------------------------------------------------- logToFile
function logToFile(message) {
  var logfile = new File("~/tmp/build/indesignlog.txt");
  logfile.open("a");
  logfile.writeln((new Date()) + "\t" + message);
  logfile.close();
}

