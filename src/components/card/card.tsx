
import { useState, useEffect } from 'react';
import { 
  Card, 
  CardPreview, 
  CardHeader, 
  Checkbox, 
  makeStyles,
} from '@fluentui/react-components';

import type{ AuditRecord } from '../audittypes';

const useStyles = makeStyles({
  card: {
    width: '300px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'box-shadow 0.2s ease', 
  },
  checkboxLayout: {
    margin: 0, 
  }
});

export interface PreviewClickCardProps {
  query:AuditRecord;
  selected:Map<string, AuditRecord>;
  setSelected:(r:AuditRecord)=> Map<string, AuditRecord>;
}

export const PreviewClickCard = ({ query,selected,setSelected }: PreviewClickCardProps) => {
  const styles = useStyles();
  const [toggled, setToggled] = useState(false);
  useEffect(()=>{
    setToggled(selected.has(query.id)? true: false)
  },[selected])
  
  function handleSelect(){
    setSelected(query);
  }

  return (
    <Card
      className={styles.card}
      selected={toggled} // Native Fluent UI v9 selection visual ring/borde
      aria-label="audit-detail-card"
      onClick={handleSelect}
      floatingAction={
        <Checkbox
          className={styles.checkboxLayout}
          checked={toggled}
          
          // Prevents the checkbox click from firing the parent Card onClick twice
          onClick={(e) => e.stopPropagation()} 
          input={{ 'aria-label': 'Select audit record' }}
        />
      }
    >
      <CardHeader 
        header="Audit Detail" 
        description={toggled ? "Selected" : "Not Selected"}
      />
      <CardPreview>
        {/* Your visual preview contents go here */}
      </CardPreview>
    </Card>
  );
};
