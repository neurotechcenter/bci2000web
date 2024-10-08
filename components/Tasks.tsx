import React, { useState, useEffect, useContext } from "react";
import { ListGroup, Card, ListGroupItem } from "react-bootstrap";
import amplifiers from "../server/config/amplifiers.json";
import { useStore } from "./store";
const Tasks = () => {
  const [task, setTask] = useState({});
  let config = useStore.getState().config;
  // useEffect(() => {
  //   (async () => {
  //     if (config) setAmpConfig(amplifiers[config.source]);
  //   })();
  // }, []);

  useStore.subscribe(
    (state) => state.task,
    (ss) => setTask(ss)
  );
  const valid = (attribute) => {
    if (attribute != null && attribute.length >= 1)
      return true;
    else
      return false;
  }

  const blockSelect = async (task, currentBlock) => {
    useStore.setState({
      block: { title: task.title, block: currentBlock.block },
    });
    //Startup
    let script = ``;
    script += `Reset System; `;
    script += `Startup System localhost; `;

    //Add task states/events
    if (valid(task.addEvents))
      task.addEvents.forEach((e) => (script += `Add Event ${e}; `));
    if (valid(task.addStates))
      task.addStates.forEach((state) => (script += `Add State ${state}; `));
    if (valid(task.addParameters))
        task.addParameters.map((tskPrm) => (script += `Add parameter ${tskPrm}; `));

    //Ask user if they want to log keyboard/mouse/etc and write that data to the source module
    //Start source module
    if (valid(task.userPrompt)) {
      if (confirm(`${Object.keys(task.userPrompt[0])}`) == true) {
        script += `Start executable ${config.source} --local ${Object.values(
          task.userPrompt[0]
        )}; `;
      } else {
        script += `Start executable ${config.source} --local; `;
      }
    } else {
      script += `Start executable ${config.source} --local; `;
    }
    //Start processing module
    if (task.executables.processing != null && task.executables.processing != "") {
      script += `Start executable ${task.executables.processing} --local; `;
    } else {
      script += `Start executable DummySignalProcessing --local; `;
    }
    //Start application module
    if (task.executables.application != null && task.executables.application != "") {
      script += `Start executable ${task.executables.application} --local; `;
    } else {
      script += `Start executable DummyApplication --local; `;
    }

    script += "Wait for Connected; ";
    console.log(`${config.subject}`);
    script += `Set parameter SubjectName ${config.subject}; `;


    script += `Set parameter SubjectSession ${currentBlock.block}; `;
    script += `Set parameter DataFile ${config.subject}/${task.title.replace(
      /\s/g,
      "_"
    )}/${task.title.replace(/\s/g, "_")}_Block${
      currentBlock.block
    }_Run%24%7bSubjectRun%7d.dat; `;

    //Source parameters
    Object.keys(config.setParameters).map((par) => {
      script += `Set parameter ${par} ${config.setParameters[par]}; `;
    });

    //Load task parameters
    task.loadParameters.map(
      (tskPrm) => (script += `Load parameterfile ${tskPrm}; `)
    );

    //Load block parameters
    currentBlock.loadParameters.map(
      (tskPrm) => (script += `Load parameterfile ${tskPrm}; `)
    );

    //Set parameters
    Object.keys(task.setParameters).map(
      (tskPrm) =>
        (script += `Set parameter ${tskPrm} ${task.setParameters[tskPrm]}; `)
    );

    //script += `Set parameter WSSourceServer *:20100; `;
    //script += `Set parameter WSSpectralOutputServer *:20203; `;
    useStore.setState({ bciConfig: script });
    useStore.getState().bci.execute(useStore.getState().bciConfig);
    //useStore.getState().bci.execute("start websocket localhost:1879");
  };

  return (
    <Card className="text-center">
      {Object.values(task).map((x: any) => {
        return (
          <div key={x.title}>
            <Card.Title key={x.title}>{x.title}</Card.Title>
            <Card.Text key={x.description}>{x.description}</Card.Text>
            <Card.Body>
              <ListGroup key={x.Blocks}>
                {Object.values(x.Blocks).map((y: any) => {
                  return (
                    <ListGroupItem
                      action
                      onClick={() => blockSelect(x, y)}
                      key={y.title}
                    >
                      {y.title}
                    </ListGroupItem>
                  );
                })}
              </ListGroup>
            </Card.Body>
          </div>
        );
      })}
    </Card>
  );
};

export default Tasks;
