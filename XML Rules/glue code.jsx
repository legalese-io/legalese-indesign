﻿//========================================================================================
//
//  $File: //depot/indesign_10.0/gm/build/scripts/xml rules/glue code.jsx $
//
//  Owner: Lin Xia
//
//  $Author: alokumar $
//
//  $DateTime: 2014/04/08 11:14:18 $
//
//  $Revision: #1 $
//
//  $Change: 875846 $
//
//  Copyright 2006-2008 Adobe Systems Incorporated. All rights reserved.
//  
//  NOTICE:  Adobe permits you to use, modify, and distribute this file in accordance 
//  with the terms of the Adobe license agreement accompanying it.  If you have received
//  this file from a source other than Adobe, then your use, modification, or 
//  distribution of it requires the prior written permission of Adobe.
//
//  DESCRIPTION: JavaScript glue code for XML Rules Processing
//
//========================================================================================

function ruleProcessorObject(ruleSet, ruleProcessor) {
   this.ruleSet = ruleSet;
   this.ruleProcessor = ruleProcessor;
}


function __makeRuleProcessor(ruleSet, prefixMappingTable){
	// Get the condition paths of all the rules.
	var pathArray = new Array();
	for (i=0; i<ruleSet.length; i++)
	{
		 pathArray.push(ruleSet[i].xpath);
	}

    // the following call can throw an exception, in which case 
    // no rules are processed  
   	try{
	    var ruleProcessor = app.xmlRuleProcessors.add(pathArray, prefixMappingTable);
   	}
   	catch(e){
   		throw e;
   	}
    var rProcessor =  new ruleProcessorObject(ruleSet, ruleProcessor);
	return rProcessor;
}

function __deleteRuleProcessor(rProcessor) {
	// remove the XMLRuleProcessor object
	rProcessor.ruleProcessor.remove();
	
	// delete the object properties
	delete rProcessor.ruleProcessor;
	delete rProcessor.ruleSet;
	
	// delete the object itself
	delete	rProcessor;
}

function __processRuleSet (root, ruleSet, prefixMappingTable)
{
	  	var mainRProcessor = __makeRuleProcessor(ruleSet, prefixMappingTable);

		// if __processTree() fails with an exception, 
		// delete ruleProcessor and throw e
		try {
	 		__processTree(root, mainRProcessor);
	  		__deleteRuleProcessor(mainRProcessor);
	 	} catch (e) {
	  		__deleteRuleProcessor(mainRProcessor);
	  		throw e;
	  	}
}

function __processTree (root, rProcessor)
{
	var ruleProcessor = rProcessor.ruleProcessor; 
	try
	{
	    var matchData = ruleProcessor.startProcessingRuleSet(root);
		__processMatchData(matchData, rProcessor);
				 
		ruleProcessor.endProcessingRuleSet();
	}
	catch (e)
	{
		// no longer deleting ruleProcessor within __processTree
		// deletion occurs either in __processRuleSet, or external
		// to glue code.
		ruleProcessor.endProcessingRuleSet();
		throw e;
	}
 }

function __processChildren(rProcessor)
{
	var ruleProcessor = rProcessor.ruleProcessor; 
	try
	{
		var matchData = ruleProcessor.startProcessingSubtree();
		__processMatchData(matchData, rProcessor);
	}
    catch (e)
    {
        ruleProcessor.halt();
        throw e;
    }
}

function __processMatchData(matchData, rProcessor)
{
	var ruleProcessor = rProcessor.ruleProcessor; 
	var ruleSet = rProcessor.ruleSet;
	while (matchData != undefined)
	{
		var element = matchData.element;
		var matchRules = matchData.matchRules;
		var applyMatchedRules = true;

		// apply the action of the rule. 
		// Continue applying rules as long as the apply function returns false.
		for (var i=0; i<matchRules.length && applyMatchedRules && !ruleProcessor.halted; i++)
		{
			applyMatchedRules = (false == ruleSet[matchRules[i]].apply(element, rProcessor));
		}
		matchData = ruleProcessor.findNextMatch();
	}
}

function __skipChildren(rProcessor)
{
	rProcessor.ruleProcessor.skipChildren();
}
